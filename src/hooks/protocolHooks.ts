import moment from 'moment'
import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'
import Service_order from '../models/Service_order'
import Subscription from '../models/Subscription'

class protocolHooks {
    static async beforeSave(protocol: Protocol) {
        const service_order = protocol?.ServiceOrderId ? await Service_order.findByPk(protocol.ServiceOrderId) : false
        const subscription = protocol?.SubscriptionId ? await Subscription.findByPk(protocol.SubscriptionId) : false

        const protocol_products = await protocol?.getProtocol_products()
        const protocol_registers = await protocol?.getProtocol_registers()

        const receipts = await protocol?.getReceipts()

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
}

export default protocolHooks
