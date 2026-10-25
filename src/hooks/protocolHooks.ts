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

function calcDiscount(discountValue: number): number {
    return Number(discountValue) || 0
}

// Cria o protocolo do próximo ciclo da assinatura. Se o vencimento já está dentro da janela de liberação, o
// protocolo nasce "Liberado para pagamento" e a cobrança é gerada na hora (sem precisar marcar manualmente).
// Tudo roda na mesma transação do fechamento: a cobrança nova precisa enxergar o pagamento ainda não commitado.
async function createRenewalProtocol(
    subscription: Subscription,
    protocol_products: Protocol_product[],
    options: InstanceUpdateOptions,
): Promise<boolean> {
    const newProtocol = await Protocol.create(
        { SubscriptionId: subscription.id, status: 'Em aberto' },
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

    const result = computeCommission(seller, registers, products, protocol.discount_value)
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

        const total_cost =
            (protocol_registers?.reduce((sum, v) => sum + v.value, 0) || 0) +
            (protocol_products?.reduce((sum, v) => sum + v.value, 0) || 0)

        const total_receipt = receipts?.reduce((sum, v) => sum + v.value, 0) || 0

        if (protocol.status == 'Fechado') {
            const discount = calcDiscount(Number(protocol.discount_value) || 0)
            if (total_receipt < (total_cost - discount))
                throw new Error('Não é possivel finalizar, protocolo com recebimentos pendentes.')

            if (subscription && !protocol.closedAt) {
                const client = await Client.findByPk(subscription.ClientId)

                let charge_type: Protocol_product['charge_type'] | false = false

                if (protocol_products.find((v) => v.charge_type == 'Mensal')) charge_type = 'Mensal'
                if (protocol_products.find((v) => v.charge_type == 'Anual')) charge_type = 'Anual'

                if (charge_type == 'Mensal' || charge_type == 'Anual') {
                    const dueAt = nextDueDate(subscription.dueAt, charge_type, client?.due_day)

                    subscription.dueAt = dueAt

                    const released = await createRenewalProtocol(subscription, protocol_products, options)

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

                    const released = await createRenewalProtocol(subscription, protocol_products, options)

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
            const client = protocol.SubscriptionId
                ? await (await protocol.getSubscription({ transaction: options.transaction }))?.getClient()
                : protocol.ServiceOrderId
                ? await (await protocol.getService_order({ transaction: options.transaction }))?.getClient()
                : protocol.ClientId
                ? await Client.findByPk(protocol.ClientId, { transaction: options.transaction })
                : null

            if (!client) return

            let billing = await Billing.findOne({
                where: { ClientId: client.id, status: 'pendente' },
                transaction: options.transaction,
            })

            if (!billing) {
                const nextDueDate = moment().set('date', client?.due_day || 1)
                if (nextDueDate.isBefore(moment(), 'day')) {
                    nextDueDate.add(1, 'month')
                }

                billing = await Billing.create(
                    { ClientId: client.id, status: 'pendente', due_date: nextDueDate.toDate() },
                    { transaction: options.transaction },
                )
            }

            const protocol_products = await protocol.getProtocol_products({ transaction: options.transaction })
            const protocol_registers = await protocol.getProtocol_registers({ transaction: options.transaction })
            const receipts = await protocol.getReceipts({ transaction: options.transaction })

            const gross =
                (protocol_products.reduce((sum, v) => sum + v.value, 0) || 0) +
                (protocol_registers.reduce((sum, v) => sum + v.value, 0) || 0)
            const discount = calcDiscount(Number(protocol.discount_value) || 0)
            const value = gross - discount - (receipts.reduce((sum, v) => sum + v.value, 0) || 0)

            await BillingProtocol.create(
                {
                    BillingId: billing.id,
                    ProtocolId: protocol.id,
                    value,
                },
                { transaction: options.transaction },
            )

            const billingProtocols = await billing.getBillingProtocols({ transaction: options.transaction })
            const total_value = billingProtocols.reduce((sum, v) => sum + v.value, 0)

            await billing.update({ total_value }, { transaction: options.transaction })
        } else if (previousStatus === 'Liberado para pagamento' && currentStatus !== 'Liberado para pagamento') {
            const billingProtocol = await BillingProtocol.findOne({
                where: { ProtocolId: protocol.id },
                include: [{ model: Billing, where: { status: 'pendente' } }],
                transaction: options.transaction,
            })

            if (billingProtocol) {
                const billing = await Billing.findByPk(billingProtocol.BillingId, { transaction: options.transaction })
                await billingProtocol.destroy({ transaction: options.transaction })

                if (billing) {
                    const billingProtocols = await billing.getBillingProtocols({ transaction: options.transaction })
                    const total_value = billingProtocols.reduce((sum, v) => sum + v.value, 0)
                    await billing.update({ total_value }, { transaction: options.transaction })
                }
            }
        }
    }
}

export default protocolHooks
