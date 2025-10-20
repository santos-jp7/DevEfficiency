import Billing from '../models/Billing'
import Protocol from '../models/Protocol'
import Service_order from '../models/Service_order'
import Subscription from '../models/Subscription'
import BillingProtocol from '../models/BillingProtocol'
import { InstanceUpdateOptions } from 'sequelize/types/model'

class billingHooks {
    static async afterUpdate(billing: Billing, options: InstanceUpdateOptions) {
        if (billing.status === 'pago' && billing.previous('status') !== 'pago') {
            const billingProtocols = await billing.getBillingProtocols({ transaction: options.transaction })

            for (const billingProtocol of billingProtocols) {
                const protocol = await Protocol.findByPk(billingProtocol.ProtocolId)
                if (!protocol) continue

                const protocol_products = await protocol.getProtocol_products({
                    transaction: options.transaction,
                })
                const protocol_registers = await protocol.getProtocol_registers({
                    transaction: options.transaction,
                })

                const receipts = await protocol.getReceipts({ transaction: options.transaction })

                const protocolValue =
                    (protocol_products.reduce((sum, v) => sum + v.value, 0) || 0) +
                    (protocol_registers.reduce((sum, v) => sum + v.value, 0) || 0) -
                    (receipts.reduce((sum, v) => sum + v.value, 0) || 0)

                console.log('Protocol Value:', protocolValue)

                if (protocolValue <= 0) {
                    await protocol.update({ status: 'Fechado' }, { transaction: options.transaction })

                    if (protocol.ServiceOrderId) {
                        const serviceOrder = await Service_order.findByPk(protocol.ServiceOrderId)
                        if (serviceOrder) {
                            await serviceOrder.update({ status: 'Finalizado' }, { transaction: options.transaction })
                        }
                    }

                    if (protocol.SubscriptionId) {
                        const subscription = await Subscription.findByPk(protocol.SubscriptionId)
                        if (subscription) {
                            await subscription.update({ status: 'Pago' }, { transaction: options.transaction })
                        }
                    }
                } else {
                    let currentBilling = await Billing.findOne({
                        where: { ClientId: billing.ClientId, status: 'pendente' },
                        transaction: options.transaction,
                    })

                    if (!currentBilling)
                        currentBilling = await Billing.create(
                            { ClientId: billing.ClientId, status: 'pendente' },
                            {
                                transaction: options.transaction,
                            },
                        )

                    await BillingProtocol.create(
                        {
                            BillingId: currentBilling.id,
                            ProtocolId: protocol.id,
                            value: billingProtocol.value,
                        },
                        { transaction: options.transaction },
                    )

                    const billingProtocols = await currentBilling.getBillingProtocols({
                        transaction: options.transaction,
                    })

                    const total_value = billingProtocols.reduce((sum, v) => sum + v.value, 0)

                    await currentBilling.update({ total_value: total_value }, { transaction: options.transaction })
                }
            }
        }
    }
}

export default billingHooks
