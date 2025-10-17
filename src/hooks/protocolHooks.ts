import moment from 'moment'
import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'
import Service_order from '../models/Service_order'
import Subscription from '../models/Subscription'
import Billing from '../models/Billing'
import BillingProtocol from '../models/BillingProtocol'
import { InstanceUpdateOptions } from 'sequelize/types/model'

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
            if (total_receipt < total_cost)
                throw new Error('Não é possivel finalizar, protocolo com recebimentos pendentes.')

            if (subscription && !protocol.closedAt) {
                let charge_type: Protocol_product['charge_type'] | false = false

                if (protocol_products.find((v) => v.charge_type == 'Mensal')) charge_type = 'Mensal'
                if (protocol_products.find((v) => v.charge_type == 'Anual')) charge_type = 'Anual'

                let dueAt: Date | false = false

                if (charge_type == 'Mensal') dueAt = moment(subscription.dueAt).add(30, 'days').toDate()
                if (charge_type == 'Anual') dueAt = moment(subscription.dueAt).add(365, 'days').toDate()

                if (dueAt) {
                    const newProtocol = await subscription.createProtocol()

                    for await (let protocol_product of protocol_products) {
                        if (['Mensal', 'Anual'].includes(protocol_product.charge_type))
                            await newProtocol?.createProtocol_product({
                                ProductId: protocol_product.ProductId,
                                value: protocol_product.value,
                                charge_type: protocol_product.charge_type,
                            })
                        else continue
                    }

                    subscription.dueAt = dueAt
                    subscription.status = 'Pago'
                    await subscription.save()
                }
            }

            if (service_order && !subscription) {
                let charge_type: Protocol_product['charge_type'] | false = false

                if (protocol_products.find((v) => v.charge_type == 'Mensal')) charge_type = 'Mensal'
                if (protocol_products.find((v) => v.charge_type == 'Anual')) charge_type = 'Anual'

                if (charge_type) {
                    let dueAt: Date | false = false

                    if (charge_type == 'Mensal') dueAt = moment().add(1, 'month').toDate()
                    if (charge_type == 'Anual') dueAt = moment().add(1, 'year').toDate()

                    if (!dueAt)
                        throw new Error('Não foi possivel criar assinatura. Divergência com tipos de cobranças.')

                    const subscription = await Subscription.create({
                        dueAt,
                        ClientId: service_order.ClientId,
                        ProjectId: service_order.ProjectId,
                        status: 'Pago',
                    })

                    protocol.SubscriptionId = subscription.id

                    const newProtocol = await subscription.createProtocol()

                    for await (let protocol_product of protocol_products) {
                        await newProtocol?.createProtocol_product({
                            ProductId: protocol_product.ProductId,
                            value: protocol_product.value,
                            charge_type: protocol_product.charge_type,
                        })

                        if (!protocol_product.LicenseId) continue

                        const license = await protocol_product.getLicense()

                        license.SubscriptionId = subscription.id

                        await license.save()
                    }
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

        if (currentStatus === 'Liberado para pagamento' && previousStatus !== 'Liberado para pagamento') {
            const client = protocol.SubscriptionId
                ? await (await protocol.getSubscription({ transaction: options.transaction }))?.getClient()
                : protocol.ServiceOrderId
                ? await (await protocol.getService_order({ transaction: options.transaction }))?.getClient()
                : null

            if (!client) return

            let billing = await Billing.findOne({
                where: { ClientId: client.id, status: 'pendente' },
                transaction: options.transaction,
            })

            if (!billing) {
                billing = await Billing.create(
                    { ClientId: client.id, status: 'pendente' },
                    { transaction: options.transaction },
                )
            }

            const protocol_products = await protocol.getProtocol_products({ transaction: options.transaction })
            const protocol_registers = await protocol.getProtocol_registers({ transaction: options.transaction })
            const receipts = await protocol.getReceipts({ transaction: options.transaction })

            const value =
                (protocol_products.reduce((sum, v) => sum + v.value, 0) || 0) +
                (protocol_registers.reduce((sum, v) => sum + v.value, 0) || 0) -
                (receipts.reduce((sum, v) => sum + v.value, 0) || 0)

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
