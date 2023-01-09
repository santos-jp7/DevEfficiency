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

    static async update(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }

    static async destroy(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }
}

export default receiptsController
