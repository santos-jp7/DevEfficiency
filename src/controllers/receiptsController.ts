import { FastifyRequest, FastifyReply } from 'fastify'

import Receipts from '../models/Receipts'
import Protocol from '../models/Protocol'

type receiptsRequest = FastifyRequest<{
    Body: Receipts
    Params: Receipts
    Headers: any
}>

class receiptsController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Receipts.findAll())
    }

    static async show(req: receiptsRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Receipts.findByPk(req.params.id))
    }

    static async store(req: receiptsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { method, value, ProtocolId, note, BankAccountId } = req.body

        const protocol = await Protocol.findByPk(ProtocolId)
        const receipt = await protocol?.createReceipt({ method, value, note, BankAccountId })

        if (protocol?.status === 'Liberado para pagamento') {
            await protocol.update({ status: 'Em aberto' })
            await protocol.update({ status: 'Liberado para pagamento' })
        }

        return res.send(receipt)
    }

    static async update(req: receiptsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { value, method, note, BankAccountId } = req.body

        const receipt = await Receipts.findByPk(id)

        await receipt?.update({ value, method, note, BankAccountId })
        await receipt?.save()

        const protocol = await Protocol.findByPk(receipt?.ProtocolId)

        if (protocol?.status === 'Liberado para pagamento') {
            await protocol.update({ status: 'Em aberto' })
            await protocol.update({ status: 'Liberado para pagamento' })
        }

        return res.send(receipt)
    }

    static async destroy(req: receiptsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params

        const receipt = await Receipts.findByPk(id)
        await receipt?.destroy()

        return res.status(204).send()
    }
}

export default receiptsController
