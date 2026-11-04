import Billing from '../models/Billing'
import Protocol from '../models/Protocol'
import Service_order from '../models/Service_order'
import Subscription from '../models/Subscription'
import BillingProtocol from '../models/BillingProtocol'
import { InstanceUpdateOptions } from 'sequelize/types/model'
import Receipts from '../models/Receipts'
import { amountDue } from '../utils/protocolCommission'
import { createPendingBilling, findOrCreatePendingBilling, partyOf, refreshBillingTotal } from '../utils/billingParty'

// Marca a assinatura como paga, exceto quando a renovação já foi liberada (cobrança nova pendente).
async function markSubscriptionPaid(subscriptionId: number, transaction?: any) {
    const subscription = await Subscription.findByPk(subscriptionId, { transaction })
    if (!subscription) return

    const released = await Protocol.count({
        where: { SubscriptionId: subscriptionId, status: 'Liberado para pagamento' },
        transaction,
    })
    if (released > 0) return

    await subscription.update({ status: 'Pago' }, { transaction })
}

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

                const receiptsTotal = receipts.reduce((sum, v) => sum + v.value, 0) || 0
                // Direto: total líquido do protocolo; por comissão: a comissão devida pelo fornecedor.
                const discountedTotal = amountDue(protocol, protocol_registers, protocol_products)
                const party = partyOf(billing)

                // Installment-based logic
                if (protocol.total_installments && protocol.total_installments > 1) {
                    const currentInstallment = protocol.current_installment || 1
                    const installmentValue = parseFloat((discountedTotal / protocol.total_installments).toFixed(2))

                    if (currentInstallment >= protocol.total_installments) {
                        await protocol.update({ status: 'Fechado' }, { transaction: options.transaction })

                        if (protocol.ServiceOrderId) {
                            const serviceOrder = await Service_order.findByPk(protocol.ServiceOrderId)
                            if (serviceOrder)
                                await serviceOrder.update({ status: 'Finalizado' }, { transaction: options.transaction })
                        }
                        if (protocol.SubscriptionId) await markSubscriptionPaid(protocol.SubscriptionId, options.transaction)
                    } else {
                        await protocol.update(
                            { current_installment: currentInstallment + 1 },
                            { transaction: options.transaction },
                        )

                        if (!party) continue

                        const nextBilling = await createPendingBilling(party, options.transaction)

                        await BillingProtocol.create(
                            { BillingId: nextBilling.id, ProtocolId: protocol.id, value: installmentValue },
                            { transaction: options.transaction },
                        )

                        await refreshBillingTotal(nextBilling, options.transaction)
                    }
                    continue
                }

                // Original remaining-value logic
                const protocolValue = discountedTotal - receiptsTotal

                console.log('Protocol Value:', protocolValue)

                if (protocolValue <= 0) {
                    await protocol.update({ status: 'Fechado' }, { transaction: options.transaction })

                    if (protocol.ServiceOrderId) {
                        const serviceOrder = await Service_order.findByPk(protocol.ServiceOrderId)
                        if (serviceOrder) {
                            await serviceOrder.update({ status: 'Finalizado' }, { transaction: options.transaction })
                        }
                    }

                    if (protocol.SubscriptionId) await markSubscriptionPaid(protocol.SubscriptionId, options.transaction)
                } else {
                    if (!party) continue

                    const currentBilling = await findOrCreatePendingBilling(party, options.transaction)

                    await BillingProtocol.create(
                        {
                            BillingId: currentBilling.id,
                            ProtocolId: protocol.id,
                            value: billingProtocol.value,
                        },
                        { transaction: options.transaction },
                    )

                    await refreshBillingTotal(currentBilling, options.transaction)
                }
            }
        }

        if (billing.BankAccountId && billing.previous('BankAccountId') !== billing.BankAccountId) {
            const billingProtocols = await billing.getBillingProtocols({ transaction: options.transaction })
            const mapBillingProtocols = billingProtocols.map((bp) => bp.ProtocolId)

            await Receipts.update(
                { BankAccountId: billing.BankAccountId },
                {
                    where: {
                        ProtocolId: mapBillingProtocols,
                    },
                    individualHooks: true,
                    transaction: options.transaction,
                },
            )
        }
    }
}

export default billingHooks
