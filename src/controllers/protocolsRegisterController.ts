import { FastifyRequest, FastifyReply } from 'fastify'

import Protocol_register from '../models/Protocol_register'
import Protocol from '../models/Protocol'
import Receipts from '../models/Receipts'

type protocolsRegisterRequest = FastifyRequest<{
    Body: Protocol_register
    Params: Protocol_register
    Headers: any
}>

class protocolsRegisterController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Protocol_register.findAll())
    }

    static async show(req: protocolsRegisterRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Protocol_register.findByPk(req.params.id))
    }

    static async store(req: protocolsRegisterRequest, res: FastifyReply): Promise<FastifyReply> {
        const { description, value, protocolId, type } = req.body

        const protocol = await Protocol.findByPk(protocolId)
        const protocol_register = await protocol?.createProtocol_register({ description, value, type })

        return res.send(protocol_register)
    }

    static async update(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }

    static async destroy(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }
}

export default protocolsRegisterController
