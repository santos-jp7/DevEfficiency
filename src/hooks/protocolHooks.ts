import moment from 'moment'
import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'
import Service_order from '../models/Service_order'
import Subscription from '../models/Subscription'
import Billing from '../models/Billing'
import BillingProtocol from '../models/BillingProtocol'
import { InstanceUpdateOptions } from 'sequelize/types/model'
import Client from '../models/Client'
import Seller from '../models/Seller'
import Payable from '../models/Payable'
import { computeCommission } from '../utils/sellerCommission'
import { getReleaseDays, isWithinReleaseWindow, nextDueDate } from '../utils/subscriptionRelease'
import { amountDue, expectedCommission, isCommission } from '../utils/protocolCommission'
import { findOrCreateFixedBilling, findOrCreatePendingBilling, refreshBillingTotal } from '../utils/billingParty'
import ProtocolInstallment from '../models/ProtocolInstallment'
import { PaymentTermsError, installmentsForRelease, validateInstallmentsForRelease } from '../utils/paymentTerms'
import { round2 } from '../utils/pricing'

// Cria o protocolo do próximo ciclo da assinatura. Se o vencimento já está dentro da janela de liberação, o
// protocolo nasce "Liberado para pagamento" e a cobrança é gerada na hora (sem precisar marcar manualmente).
// Tudo roda na mesma transação do fechamento: a cobrança nova precisa enxergar o pagamento ainda não commitado.
async function createRenewalProtocol(
    previous: Protocol,
    subscription: Subscription,
    protocol_products: Protocol_product[],
    options: InstanceUpdateOptions,
): Promise<boolean> {
    const newProtocol = await Protocol.create(
        {
            SubscriptionId: subscription.id,
            status: 'Em aberto',
            // Protocolo por comissão: a renovação continua sendo cobrada do mesmo fornecedor.
            billing_mode: previous.billing_mode || 'Direto',
            CommissionSupplierId: previous.CommissionSupplierId || null,
            commission_percent: previous.commission_percent ?? null,
            commission_value: previous.commission_manual ? previous.commission_value ?? null : null,
            commission_manual: !!previous.commission_manual,
            // Condição de pagamento se repete (vencimentos manuais não: são datas do ciclo anterior).
            payment_terms: previous.payment_terms ?? null,
        },
        { transaction: options.transaction },
    )

    for (const protocol_product of protocol_products) {
        if (!['Mensal', 'Anual'].includes(protocol_product.charge_type)) continue

        await Protocol_product.create(
            {
                ProductId: protocol_product.ProductId,
                value: protocol_product.value,
                charge_type: protocol_product.charge_type,
                ProtocolId: newProtocol.id,
            },
            { transaction: options.transaction },
        )
    }

    // Recalcula a comissão sugerida agora que os produtos existem.
    if (isCommission(newProtocol) && !newProtocol.commission_manual) {
        const products = await newProtocol.getProtocol_products({ transaction: options.transaction })
        await newProtocol.update(
            { commission_value: expectedCommission(newProtocol, [], products) },
            { transaction: options.transaction },
        )
    }

    if (!isWithinReleaseWindow(subscription.dueAt, await getReleaseDays())) return false

    await newProtocol.update({ status: 'Liberado para pagamento' }, { transaction: options.transaction })
    return true
}

// Gera a conta a pagar da comissão quando o protocolo é finalizado. Idempotente por protocolo.
async function createSellerPayable(protocol: Protocol, options: InstanceUpdateOptions) {
    if (!protocol.SellerId) return

    const existing = await Payable.findOne({
        where: { ProtocolId: protocol.id, SellerId: protocol.SellerId },
        transaction: options.transaction,
    })
    if (existing) return

    const seller = await Seller.findByPk(protocol.SellerId, { transaction: options.transaction })
    if (!seller) return

    const registers = await protocol.getProtocol_registers({ transaction: options.transaction })
    const products = await protocol.getProtocol_products({ transaction: options.transaction })

    const result = computeCommission(
        seller,
        registers,
        products,
        protocol.discount_value,
        isCommission(protocol) ? expectedCommission(protocol, registers, products) : null,
    )
    if (!result.eligible || result.commission <= 0) return

    await Payable.create(
        {
            description: `Comissão ${seller.name} - Protocolo #${protocol.id}`,
            value: result.commission,
            dueDate: moment().add(seller.payment_delay_days || 0, 'days').format('YYYY-MM-DD') as any,
            status: 'pendente',
            SellerId: seller.id,
            ProtocolId: protocol.id,
            CostCenterId: seller.CostCenterId as any,
        },
        { transaction: options.transaction },
    )
}

class protocolHooks {
    static async beforeSave(protocol: Protocol, options: InstanceUpdateOptions) {
        const service_order = protocol?.ServiceOrderId ? await Service_order.findByPk(protocol.ServiceOrderId) : false
        const subscription = protocol?.SubscriptionId ? await Subscription.findByPk(protocol.SubscriptionId) : false

        const protocol_products = await protocol?.getProtocol_products({ transaction: options.transaction })
        const protocol_registers = await protocol?.getProtocol_registers({ transaction: options.transaction })

        const receipts = await protocol?.getReceipts({ transaction: options.transaction })

        if (isCommission(protocol)) {
            // Comissão sugerida acompanha itens/desconto; valor informado na mão fica travado.
            if (!protocol.commission_manual)
                protocol.commission_value = expectedCommission(protocol, protocol_registers || [], protocol_products || [])

            if (['Liberado para pagamento', 'Fechado'].includes(protocol.status as string) && protocol.changed('status')) {
                if (!protocol.CommissionSupplierId)
                    throw new Error('Protocolo por comissão sem fornecedor: informe de quem a comissão será recebida.')
                if (!(Number(protocol.commission_value) > 0))
                    throw new Error('Protocolo por comissão sem valor de comissão.')
            }
        }

        const total_due = amountDue(protocol, protocol_registers || [], protocol_products || [])
        const total_receipt = receipts?.reduce((sum, v) => sum + v.value, 0) || 0

        // Condição de pagamento: parcelas precisam fechar com o valor em aberto antes de liberar.
        if (protocol.status === 'Liberado para pagamento' && protocol.changed('status') && protocol.id) {
            try {
                await validateInstallmentsForRelease(protocol, round2(total_due - total_receipt), options.transaction)
            } catch (e) {
                if (e instanceof PaymentTermsError) throw new Error(e.message)
                throw e
            }
        }

        if (protocol.status == 'Fechado') {
            if (round2(total_receipt) < round2(total_due))
                throw new Error('Não é possivel finalizar, protocolo com recebimentos pendentes.')

            if (subscription && !protocol.closedAt) {
                const client = await Client.findByPk(subscription.ClientId)

                let charge_type: Protocol_product['charge_type'] | false = false

                if (protocol_products.find((v) => v.charge_type == 'Mensal')) charge_type = 'Mensal'
                if (protocol_products.find((v) => v.charge_type == 'Anual')) charge_type = 'Anual'

                if (charge_type == 'Mensal' || charge_type == 'Anual') {
                    const dueAt = nextDueDate(subscription.dueAt, charge_type, client?.due_day)

                    subscription.dueAt = dueAt

                    const released = await createRenewalProtocol(protocol, subscription, protocol_products, options)

                    // Renovação liberada = cobrança nova pendente; senão a assinatura está em dia até a janela abrir.
                    subscription.status = released ? 'Pendente' : 'Pago'
                    await subscription.save({ transaction: options.transaction })
                }
            }

            if (service_order && !subscription) {
                const client = await service_order.getClient()

                let charge_type: Protocol_product['charge_type'] | false = false

                if (protocol_products.find((v) => v.charge_type == 'Mensal')) charge_type = 'Mensal'
                if (protocol_products.find((v) => v.charge_type == 'Anual')) charge_type = 'Anual'

                if (charge_type) {
                    const dueAt = nextDueDate(moment().toDate(), charge_type, client?.due_day)

                    const subscription = await Subscription.create(
                        {
                            dueAt,
                            ClientId: service_order.ClientId,
                            ProjectId: service_order.ProjectId,
                            status: 'Pago',
                        },
                        { transaction: options.transaction },
                    )

                    protocol.SubscriptionId = subscription.id

                    const released = await createRenewalProtocol(protocol, subscription, protocol_products, options)

                    for (const protocol_product of protocol_products) {
                        if (!protocol_product.LicenseId) continue

                        const license = await protocol_product.getLicense()

                        license.SubscriptionId = subscription.id

                        await license.save({ transaction: options.transaction })
                    }

                    if (released) await subscription.update({ status: 'Pendente' }, { transaction: options.transaction })
                }
            }

            protocol.closedAt = moment().toDate()
        }

        if (protocol.status == 'Cancelado') {
            if (total_receipt > 0) throw new Error('Não é possivel finalizar, protocolo com recebimentos.')
        }
    }

    static async afterUpdate(protocol: Protocol, options: InstanceUpdateOptions) {
        const previousStatus = protocol.previous('status')
        const currentStatus = protocol.get('status')

        if (currentStatus === 'Fechado' && previousStatus !== 'Fechado') await createSellerPayable(protocol, options)

        if (currentStatus === 'Liberado para pagamento' && previousStatus !== 'Liberado para pagamento') {
            let party: { ClientId: number } | { SupplierId: number } | null = null

            if (isCommission(protocol)) {
                // O fornecedor cobra o cliente; a cobrança gerada aqui é a da comissão, contra o fornecedor.
                if (protocol.CommissionSupplierId) party = { SupplierId: protocol.CommissionSupplierId }
            } else {
                const client = protocol.SubscriptionId
                    ? await (await protocol.getSubscription({ transaction: options.transaction }))?.getClient()
                    : protocol.ServiceOrderId
                    ? await (await protocol.getService_order({ transaction: options.transaction }))?.getClient()
                    : protocol.ClientId
                    ? await Client.findByPk(protocol.ClientId, { transaction: options.transaction })
                    : null

                if (client) party = { ClientId: client.id }
            }

            if (!party) return

            const protocol_products = await protocol.getProtocol_products({ transaction: options.transaction })
            const protocol_registers = await protocol.getProtocol_registers({ transaction: options.transaction })
            const receipts = await protocol.getReceipts({ transaction: options.transaction })

            const value = round2(
                amountDue(protocol, protocol_registers, protocol_products) -
                    (receipts.reduce((sum, v) => sum + v.value, 0) || 0),
            )

            // Condição de pagamento (ex.: 15/30/60 ou vencimentos manuais): uma cobrança por vencimento.
            const installments = await installmentsForRelease(protocol, value, options.transaction)
            if (installments) {
                for (const installment of installments) {
                    const billing = await findOrCreateFixedBilling(party, installment.due_date, options.transaction)
                    await BillingProtocol.create(
                        {
                            BillingId: billing.id,
                            ProtocolId: protocol.id,
                            ProtocolInstallmentId: installment.id,
                            value: round2(installment.value - installment.paid_value),
                        },
                        { transaction: options.transaction },
                    )
                    await refreshBillingTotal(billing, options.transaction)
                }
                return
            }

            const billing = await findOrCreatePendingBilling(party, options.transaction)

            await BillingProtocol.create(
                {
                    BillingId: billing.id,
                    ProtocolId: protocol.id,
                    value,
                },
                { transaction: options.transaction },
            )

            await refreshBillingTotal(billing, options.transaction)
        } else if (previousStatus === 'Liberado para pagamento' && currentStatus !== 'Liberado para pagamento') {
            // Tira o protocolo de todas as cobranças ainda pendentes (uma por parcela, quando há condição de pagamento).
            const billingProtocols = await BillingProtocol.findAll({
                where: { ProtocolId: protocol.id },
                include: [{ model: Billing, where: { status: 'pendente' } }],
                transaction: options.transaction,
            })

            for (const billingProtocol of billingProtocols) {
                const billing = await Billing.findByPk(billingProtocol.BillingId, { transaction: options.transaction })
                await billingProtocol.destroy({ transaction: options.transaction })
                if (!billing) continue

                await refreshBillingTotal(billing, options.transaction)
                // Cobrança de parcela que ficou vazia deixa de existir.
                if (billing.fixed_due_date && (await billing.getBillingProtocols({ transaction: options.transaction })).length === 0)
                    await billing.destroy({ transaction: options.transaction })
            }

            // Parcelas calculadas pela condição são refeitas na próxima liberação; as manuais ficam como estão.
            if (!protocol.installments_manual)
                await ProtocolInstallment.destroy({ where: { ProtocolId: protocol.id, status: 'pendente', paid_value: 0 }, transaction: options.transaction })
        }
    }
}

export default protocolHooks
