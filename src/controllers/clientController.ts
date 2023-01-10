import { FastifyRequest, FastifyReply } from 'fastify'

import Client from '../models/Client'
import Credential from '../models/Credential'
import Project from '../models/Project'

type clientRequest = FastifyRequest<{
    Body: Client
    Params: Client
    Headers: any
}>
class clientController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Client.findAll())
    }

    static async show(req: clientRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(
            await Client.findByPk(req.params.id, {
                include: [Credential, Project],
            }),
        )
    }

    static async store(req: clientRequest, res: FastifyReply): Promise<FastifyReply> {
        const { name } = req.body

        return res.send(await Client.create({ name }))
    }

    static async update(req: clientRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { name } = req.body

        const client = await Client.findByPk(id)

        await client?.update({ name })
        await client?.save()

        return res.send(client)
    }
}

export default clientController
