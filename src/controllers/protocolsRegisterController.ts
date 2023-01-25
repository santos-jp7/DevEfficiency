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
        const { description, value, ProtocolId, type } = req.body

        const protocol = await Protocol.findByPk(ProtocolId)
        const protocol_register = await protocol?.createProtocol_register({ description, value, type })

        return res.send(protocol_register)
    }

    static async update(req: protocolsRegisterRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { description, value, type } = req.body

        const protocol_register = await Protocol_register.findByPk(id)

        await protocol_register?.update({ description, value, type })
        await protocol_register?.save()

        return res.send(protocol_register)
    }

    static async destroy(req: protocolsRegisterRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params

        const protocol_register = await Protocol_register.findByPk(id)
        await protocol_register?.destroy()

        return res.status(204).send()
    }
}

export default protocolsRegisterController
