import { FastifyRequest, FastifyReply } from 'fastify'
import Client from '../models/Client'
import User from '../models/User'

type clientRequest = FastifyRequest<{
    Body: Client
    Params: Client
    Headers: any
}>
class clientController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Client.findAll({ include: 'credentials' }))
    }

    static async show(req: clientRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Client.findByPk(req.params.id))
    }

    static async store(req: clientRequest, res: FastifyReply): Promise<FastifyReply> {
        const { name } = req.body

        return res.send(await Client.create({ name }))
    }

    static async update(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }

    static async destroy(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }
}

export default clientController
