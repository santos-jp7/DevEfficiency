import { FastifyRequest, FastifyReply } from 'fastify'
import Billing from '../models/Billing'
import BillingProtocol from '../models/BillingProtocol'

type billingProtocolRequest = FastifyRequest<{
    Body: BillingProtocol
    Params: BillingProtocol
    Headers: any
}>

class billingProtocolController {
    static async update(req: billingProtocolRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { value } = req.body

        const billingProtocol = await BillingProtocol.findByPk(id)

        if (!billingProtocol) {
            return res.status(404).send({ message: 'Protocolo da cobrança não encontrado' })
        }

        // Block value changes if billing is already faturada
        const billingCheck = await Billing.findByPk(billingProtocol.BillingId)
        if (billingCheck?.status === 'faturada') {
            return res.status(400).send({ message: 'Cobrança já faturada. Não é possível alterar o valor.' })
        }

        await billingProtocol.update({ value })

        const billing = await Billing.findByPk(billingProtocol.BillingId, {
            include: [BillingProtocol],
        })

        if (billing) {
            const total_value = billing.BillingProtocols.reduce((sum, p) => sum + Number(p.value), 0)
            await billing.update({ total_value })
        }

        return res.send(billingProtocol)
    }
}

export default billingProtocolController
