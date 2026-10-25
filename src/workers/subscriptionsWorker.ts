import Protocol from '../models/Protocol'
import { Op } from 'sequelize'
import Subscription from '../models/Subscription'
import moment from 'moment'
import { getReleaseDays, isWithinReleaseWindow } from '../utils/subscriptionRelease'

export default new (class subscriptionsWorker {
    private running = false

    public setup(): void {
        this.loop()

        setInterval(() => {
            this.loop()
        }, 600000)
    }

    private async loop(): Promise<void> {
        if (this.running) return
        this.running = true

        try {
            const releaseDays = await getReleaseDays()

            // Qualquer assinatura (a condição antiga `> 1` deixava a assinatura #1 de fora, sem liberar nunca).
            const where: any = { status: ['Em aberto', 'Liberado para pagamento'], SubscriptionId: { [Op.not]: null } }
            const protocols: Protocol[] = await Protocol.findAll({ where, include: [Subscription] })

            for (const protocol of protocols) {
                try {
                    await this.process(protocol, releaseDays)
                } catch (err) {
                    console.error(`[assinaturas] erro no protocolo #${protocol.id}`, err)
                }
            }
        } catch (err) {
            console.error('[assinaturas] erro ao processar assinaturas', err)
        } finally {
            this.running = false
        }
    }

    private async process(protocol: Protocol, releaseDays: number): Promise<void> {
        const subscription = protocol.Subscription
        if (!subscription || subscription.status == 'Cancelado') return

        // Libera a cobrança quando o vencimento entra na janela (configurável: subscription_release_days).
        if (protocol.status == 'Em aberto') {
            if (!isWithinReleaseWindow(subscription.dueAt, releaseDays)) return

            await protocol.update({ status: 'Liberado para pagamento' })
            await subscription.update({ status: 'Pendente' })
            return
        }

        // Liberado e vencido há mais de 3 dias sem pagamento.
        if (moment().diff(moment(subscription.dueAt).add(3, 'days'), 'days') < 0) return

        if (subscription.status != 'Não pago') await subscription.update({ status: 'Não pago' })
    }
})()
