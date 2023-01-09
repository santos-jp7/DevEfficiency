import { FastifyRequest, FastifyReply } from 'fastify'

import Protocol from '../models/Protocol'
import Protocol_register from '../models/Protocol_register'
import Receipts from '../models/Receipts'

type protocolsRequest = FastifyRequest<{
    Body: Protocol
    Params: Protocol
    Headers: any
}>

class protocolsController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Protocol.findAll())
    }

    static async show(req: protocolsRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(
            await Protocol.findByPk(req.params.id, {
                include: [Protocol_register, Receipts],
            }),
        )
    }

    static async update(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }

    static async destroy(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }
}

export default protocolsController
