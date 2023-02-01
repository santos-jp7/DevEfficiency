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
        let { name, corporate_name, document, email } = req.body

        if (document) document = document.replace(/[^a-zA-Z0-9 ]/g, '')

        return res.send(await Client.create({ name, corporate_name, document, email }))
    }

    static async update(req: clientRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        let { name, corporate_name, document, email } = req.body

        if (document) document = document.replace(/[^a-zA-Z0-9 ]/g, '')

        const client = await Client.findByPk(id)

        await client?.update({ name, corporate_name, document, email })
        await client?.save()

        return res.send(client)
    }
}

export default clientController
