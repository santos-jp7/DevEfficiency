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
        const { method, value, protocolId, note } = req.body

        const protocol = await Protocol.findByPk(protocolId)
        const protocol_register = await protocol?.createReceipt({ method, value, note })

        return res.send(protocol_register)
    }

    static async update(req: receiptsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { value, method, note } = req.body

        const receipt = await Receipts.findByPk(id)

        await receipt?.update({ value, method, note })
        await receipt?.save()

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
