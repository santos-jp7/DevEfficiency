import { Op } from 'sequelize'
import moment from 'moment'

import db from '../db'
import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'
import Subscription from '../models/Subscription'
import Client from '../models/Client'
import Billing from '../models/Billing'
import BillingProtocol from '../models/BillingProtocol'
import { createRenewalProtocol } from '../hooks/protocolHooks'
import { getCycleStartDate, getReleaseDays, isWithinReleaseWindow, nextBillableDueDate } from '../utils/subscriptionRelease'

// Limite de ciclos gerados de uma vez para uma assinatura (ex.: sistema parado por muito tempo).
const MAX_CYCLES_PER_RUN = 24

export default new (class subscriptionsWorker {
    private running = false
    private cycleStart = moment('1970-01-01')

    public setup(): void {
        this.loop()

        setInterval(() => {
            this.loop()
        }, 600000)
    }

    public async loop(): Promise<void> {
        if (this.running) return
        this.running = true

        try {
            const releaseDays = await getReleaseDays()
            this.cycleStart = await getCycleStartDate()
            const subscriptions = await Subscription.findAll({ where: { status: { [Op.ne]: 'Cancelado' } } })

            for (const subscription of subscriptions) {
                try {
                    await this.process(subscription, releaseDays)
                } catch (err) {
                    console.error(`[assinaturas] erro na assinatura #${subscription.id}`, err)
                }
            }
        } catch (err) {
            console.error('[assinaturas] erro ao processar assinaturas', err)
        } finally {
            this.running = false
        }
    }

    private async process(subscription: Subscription, releaseDays: number): Promise<void> {
        const protocols = await Protocol.findAll({
            where: { SubscriptionId: subscription.id, status: { [Op.ne]: 'Cancelado' } },
            order: [['id', 'ASC']],
        })
        if (!protocols.length) return

        // Libera a cobrança quando o vencimento entra na janela (configurável: subscription_release_days).
        for (const protocol of protocols) {
            if (protocol.status !== 'Em aberto') continue
            if (!isWithinReleaseWindow(subscription.dueAt, releaseDays)) continue
            // Renovação com comissão a revisar: espera a confirmação do valor (aparece no dashboard).
            if (protocol.commission_review_pending) continue
            await protocol.update({ status: 'Liberado para pagamento' })
        }

        await this.generateDueCycles(subscription, protocols[protocols.length - 1], releaseDays)
        await this.refreshStatus(subscription)
    }

    // Cobrar todo mês: passou o vencimento do ciclo atual e ele não foi pago → gera o ciclo seguinte mesmo assim
    // (o pagamento em atraso não "apaga" os meses de inadimplência). Repete até alcançar a data de hoje.
    private async generateDueCycles(subscription: Subscription, latest: Protocol, releaseDays: number): Promise<void> {
        let current = latest
        for (let i = 0; i < MAX_CYCLES_PER_RUN; i++) {
            if (current.status !== 'Liberado para pagamento') return
            // Só depois do vencimento: no próprio dia a cobrança ainda está em dia.
            if (!moment(subscription.dueAt).isBefore(moment(), 'day')) return

            const products = await Protocol_product.findAll({ where: { ProtocolId: current.id } })
            const chargeType = products.some((p) => p.charge_type === 'Anual')
                ? 'Anual'
                : products.some((p) => p.charge_type === 'Mensal')
                ? 'Mensal'
                : null
            if (!chargeType) return

            const client = await Client.findByPk(subscription.ClientId)
            const next = nextBillableDueDate(subscription.dueAt, chargeType, client?.due_day, this.cycleStart)
            if (!isWithinReleaseWindow(next, releaseDays)) return

            const previous = current
            await db.transaction(async (transaction) => {
                subscription.dueAt = next
                await subscription.save({ transaction })
                await createRenewalProtocol(previous, subscription, products, { transaction } as any)
            })

            const created = await Protocol.findOne({ where: { SubscriptionId: subscription.id }, order: [['id', 'DESC']] })
            if (!created || created.id === previous.id) return
            current = created
            console.log(`[assinaturas] assinatura #${subscription.id}: ciclo com vencimento ${moment(next).format('DD/MM/YYYY')} gerado (protocolo #${created.id})`)
        }
    }

    // Não pago: alguma cobrança dos protocolos em aberto venceu há mais de 3 dias. Pendente: há cobrança em aberto.
    // Pago: nada em aberto.
    private async refreshStatus(subscription: Subscription): Promise<void> {
        const unpaid = await Protocol.findAll({
            where: { SubscriptionId: subscription.id, status: 'Liberado para pagamento' },
            attributes: ['id'],
        })

        let status: Subscription['status'] = 'Pago'
        if (unpaid.length) {
            const overdue = await BillingProtocol.count({
                where: { ProtocolId: unpaid.map((p) => p.id) },
                include: [
                    {
                        model: Billing,
                        where: {
                            status: ['pendente', 'faturada'],
                            due_date: { [Op.lt]: moment().subtract(3, 'days').startOf('day').toDate() },
                        },
                    },
                ],
            })
            status = overdue ? 'Não pago' : 'Pendente'
        } else if (await Protocol.count({ where: { SubscriptionId: subscription.id, status: 'Em aberto' } })) {
            // Próximo ciclo ainda não liberado: em dia até a janela abrir.
            status = 'Pago'
        }

        if (subscription.status !== status) await subscription.update({ status })
    }
})()
