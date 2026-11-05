import { FastifyRequest, FastifyReply } from 'fastify'

import db from '../db'

import Billing from '../models/Billing'
import BillingProtocol from '../models/BillingProtocol'
import Protocol from '../models/Protocol'
import Protocol_register from '../models/Protocol_register'
import Protocol_product from '../models/Protocol_product'
import { reconcileTarget } from './reconciliation'
import ProtocolInstallment from '../models/ProtocolInstallment'
import { refreshBillingTotal } from './billingParty'
import { Op } from 'sequelize'
import { computeLateCharges, getLateRules } from './lateCharges'

class AllocationError extends Error {}

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100

// Baixa de cobrança de fornecedor linha a linha. O que não entrou volta para uma nova cobrança pendente (billingHooks);
// "quitar" fixa a comissão no total recebido daquele protocolo e cancela o que ainda estava previsto.
async function receiveSupplierAllocations(
    billing: Billing,
    allocations: { BillingProtocolId: number; value: number | string; settle?: boolean }[],
    payment: { method: any; BankAccountId: number },
    trx: any,
) {
    const lines = new Map((billing.BillingProtocols || []).map((bp) => [bp.id, bp]))
    let total = 0

    for (const a of allocations) {
        const bp = lines.get(Number(a.BillingProtocolId))
        if (!bp) throw new AllocationError('Comissão não pertence a esta cobrança.')
        const value = r2(Number(a.value))
        if (!Number.isFinite(value) || value < 0) throw new AllocationError('Valor recebido inválido.')
        if (value > r2(bp.value) + 0.009 && !a.settle) throw new AllocationError(`Valor acima do previsto no protocolo #${bp.ProtocolId}: marque "quitar" para aceitar o valor final.`)
        total = r2(total + value)

        if (value > 0)
            await bp.Protocol.createReceipt(
                { method: payment.method, value, note: `Recebido via cobrança #${billing.id}`, BankAccountId: payment.BankAccountId },
                { transaction: trx },
            )
        await bp.update({ received_value: value }, { transaction: trx })

        if (a.settle) {
            const protocol = bp.Protocol
            const receipts = await protocol.getReceipts({ transaction: trx })
            const received = r2(receipts.reduce((s, r) => s + Number(r.value), 0))
            // Valor final da comissão = tudo o que entrou; parcelas futuras e cobranças pendentes deste protocolo deixam de valer.
            await protocol.update({ commission_value: received, commission_manual: true }, { transaction: trx })
            await ProtocolInstallment.update(
                { status: 'cancelado' },
                { where: { ProtocolId: protocol.id, status: 'pendente', id: { [Op.ne]: bp.ProtocolInstallmentId || 0 } } as any, transaction: trx },
            )
            if (bp.ProtocolInstallmentId)
                await ProtocolInstallment.update({ value: value, status: 'pendente' }, { where: { id: bp.ProtocolInstallmentId, paid_value: 0 } as any, transaction: trx })
            const others = await BillingProtocol.findAll({
                where: { ProtocolId: protocol.id, BillingId: { [Op.ne]: billing.id } },
                include: [{ model: Billing, where: { status: 'pendente' } }],
                transaction: trx,
            })
            for (const other of others) {
                const otherBilling = await Billing.findByPk(other.BillingId, { transaction: trx })
                await other.destroy({ transaction: trx })
                if (!otherBilling) continue
                await refreshBillingTotal(otherBilling, trx)
                if (otherBilling.fixed_due_date && (await otherBilling.getBillingProtocols({ transaction: trx })).length === 0)
                    await otherBilling.destroy({ transaction: trx })
            }
        }
    }

    // Linhas sem valor informado contam como nada recebido (voltam para a próxima cobrança).
    for (const bp of lines.values())
        if (!allocations.some((a) => Number(a.BillingProtocolId) === bp.id)) await bp.update({ received_value: 0 }, { transaction: trx })

    if (!(total > 0) && !allocations.some((a) => a.settle)) throw new AllocationError('Informe o valor recebido em ao menos uma comissão.')

    await billing.update(
        { status: 'pago', payment_date: new Date(), BankAccountId: payment.BankAccountId, method: payment.method, paid_value: total },
        { transaction: trx },
    )
}

export default async function billingReceipt(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
    const { id, method, BankAccountId, received_value, allocations } = req.body as {
        id: string
        method: 'Pix' | 'Boleto' | 'Cartão' | 'Transferência' | 'Espécie'
        BankAccountId: number
        received_value?: number | string | null
        // Cobrança de fornecedor: quanto entrou em cada comissão; settle = quitar com esse valor (não vem mais nada).
        allocations?: { BillingProtocolId: number; value: number | string; settle?: boolean }[]
    }

    let trx = await db.transaction()

    try {
        const billing = await Billing.findByPk(id, {
            include: [
                {
                    model: BillingProtocol,
                    include: [Protocol],
                },
            ],
        })

        if (!billing) {
            await trx.rollback()
            return res.status(404).send({ error: true, message: 'Cobrança não encontrada' })
        }

        if (billing.status === 'pago') {
            await trx.rollback()
            return res.status(400).send({ error: true, message: 'Cobrança já está paga' })
        }

        if (!billing.BillingProtocols || billing.BillingProtocols.length === 0) {
            await trx.rollback()
            return res.status(400).send({ error: true, message: 'Nenhum protocolo associado a esta cobrança' })
        }

        // Repasse de fornecedor com valor por comissão (parcial, parcelado ou diferente do previsto).
        if (billing.SupplierId && Array.isArray(allocations) && allocations.length > 0) {
            try {
                await receiveSupplierAllocations(billing, allocations, { method, BankAccountId }, trx)
            } catch (e: any) {
                await trx.rollback()
                if (e instanceof AllocationError) return res.status(400).send({ error: true, message: e.message })
                throw e
            }
            await trx.commit()
            await reconcileTarget('billing', billing.id)
            return res.send({ error: false })
        }

        // Em atraso: o valor recebido precisa ser confirmado (sugestão = valor + multa + juros) e pode ser alterado.
        // Os encargos são informativos: o valor da cobrança não muda; o excedente recebido vira um recibo de encargos.
        const principal = Math.round(billing.BillingProtocols.reduce((sum, bp) => sum + Number(bp.value), 0) * 100) / 100
        // Comissão de fornecedor não tem multa/juros.
        const late = computeLateCharges(principal, billing.SupplierId ? null : billing.due_date, await getLateRules())
        const hasValue = received_value !== undefined && received_value !== null && received_value !== ''
        let received = principal

        if (late.overdue) {
            if (!hasValue) {
                await trx.rollback()
                return res.status(409).send({
                    error: true,
                    requires_confirmation: true,
                    message: `Cobrança em atraso há ${late.days} dia(s). Confirme o valor recebido (valor + multa + juros = ${late.total_with_charges.toFixed(2)}).`,
                    late,
                })
            }

            received = Math.round(Number(received_value) * 100) / 100
            if (!Number.isFinite(received) || received < principal) {
                await trx.rollback()
                return res.status(400).send({ error: true, message: `O valor recebido não pode ser menor que o valor da cobrança (${principal.toFixed(2)}). Para dar desconto, ajuste a cobrança/protocolo.` })
            }
        } else if (hasValue && Math.round(Number(received_value) * 100) !== Math.round(principal * 100)) {
            await trx.rollback()
            return res.status(400).send({ error: true, message: 'Só é possível alterar o valor recebido em cobranças em atraso.' })
        }

        for (const billingProtocol of billing.BillingProtocols) {
            if (!billingProtocol.Protocol) {
                await trx.rollback()
                return res.status(400).send({ error: true, message: 'Protocolo associado à cobrança não encontrado' })
            }

            await billingProtocol.Protocol.createReceipt(
                {
                    method: method,
                    value: billingProtocol.value,
                    note: `Recebido via cobrança #${billing.id}`,
                    BankAccountId: BankAccountId,
                },
                { transaction: trx },
            )
        }

        // Excedente (multa/juros efetivamente recebidos): recibo de encargos no primeiro protocolo, para o saldo da conta
        // refletir o dinheiro que entrou. A nota começa igual aos demais recibos da cobrança (a conciliação a trata junto).
        const extra = Math.round((received - principal) * 100) / 100
        if (extra > 0) {
            await billing.BillingProtocols[0].Protocol.createReceipt(
                {
                    method: method,
                    value: extra,
                    note: `Recebido via cobrança #${billing.id} — encargos por atraso (multa/juros)`,
                    BankAccountId: BankAccountId,
                },
                { transaction: trx },
            )
        }

        await billing.update(
            {
                status: 'pago',
                payment_date: new Date(),
                BankAccountId,
                method,
                paid_value: received,
                late_fee_value: late.overdue ? late.fee : null,
                late_interest_value: late.overdue ? late.interest : null,
            },
            { transaction: trx },
        )

        await trx.commit()

        // Avalia o recebimento contra o extrato já importado (não interfere no resultado do pagamento).
        await reconcileTarget('billing', billing.id)

        return res.send({ error: false })
    } catch (err) {
        await trx.rollback()
        console.error(err)
        return res.status(500).send({ error: true, message: 'Erro ao processar recebimentos' })
    }
}
