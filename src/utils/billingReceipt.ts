import { FastifyRequest, FastifyReply } from 'fastify'

import db from '../db'

import Billing from '../models/Billing'
import BillingProtocol from '../models/BillingProtocol'
import Protocol from '../models/Protocol'
import Protocol_register from '../models/Protocol_register'
import Protocol_product from '../models/Protocol_product'
import { reconcileTarget } from './reconciliation'
import { computeLateCharges, getLateRules } from './lateCharges'

export default async function billingReceipt(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
    const { id, method, BankAccountId, received_value } = req.body as {
        id: string
        method: 'Pix' | 'Boleto' | 'Cartão' | 'Transferência' | 'Espécie'
        BankAccountId: number
        received_value?: number | string | null
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

        // Em atraso: o valor recebido precisa ser confirmado (sugestão = valor + multa + juros) e pode ser alterado.
        // Os encargos são informativos: o valor da cobrança não muda; o excedente recebido vira um recibo de encargos.
        const principal = Math.round(billing.BillingProtocols.reduce((sum, bp) => sum + Number(bp.value), 0) * 100) / 100
        const late = computeLateCharges(principal, billing.due_date, await getLateRules())
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
