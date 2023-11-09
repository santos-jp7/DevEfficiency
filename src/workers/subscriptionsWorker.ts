import Protocol from '../models/Protocol'
import { Op, literal } from 'sequelize'
import Subscription from '../models/Subscription'
import moment from 'moment'

export default new (class subscriptionsWorker {
    public setup(): void {
        this.loop()

        setInterval(() => {
            this.loop()
        }, 600000)
    }

    private async loop(): Promise<void> {
        const protocols = await Protocol.findAll({
            where: {
                status: ['Em aberto', 'Liberado para pagamento'],
                SubscriptionId: {
                    [Op.gt]: 1,
                },
            },
            include: [Subscription],
        })

        for await (let protocol of protocols) {
            if (protocol.status == 'Em aberto') {
                if (moment(protocol.Subscription.dueAt).diff(moment(), 'days') > 7) continue

                protocol.status = 'Liberado para pagamento'
                protocol.Subscription.status = 'Pendente'

                await protocol.save()
                await protocol.Subscription.save()
            }

            if (protocol.status == 'Liberado para pagamento') {
                if (moment().diff(moment(protocol.Subscription.dueAt).add(3, 'days'), 'days') < 0) continue

                protocol.Subscription.status = 'Não pago'
                await protocol.Subscription.save()
            }
        }
    }
})()
