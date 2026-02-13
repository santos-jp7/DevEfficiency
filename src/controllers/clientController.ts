import { FastifyRequest, FastifyReply } from 'fastify'

import Client from '../models/Client'
import Contact from '../models/Contact'
import Credential from '../models/Credential'
import Project from '../models/Project'
import Server from '../models/Server'
import Config from '../models/Config'

type clientRequest = FastifyRequest<{
    Body: Client
    Params: Client
    Headers: any
}>
import Billing from '../models/Billing'
import Address from '../models/Address'

class clientController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Client.findAll())
    }

    static async show(req: clientRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(
            await Client.findByPk(req.params.id, {
                include: [Credential, Project, Server, Contact, Address],
            }),
        )
    }

    static async store(req: clientRequest, res: FastifyReply): Promise<FastifyReply> {
        let { name, corporate_name, document, email, due_day } = req.body

        let default_day_due = await Config.findOne({ where: { type: 'default_day_due' } })

        due_day = due_day || parseInt(default_day_due?.value || '20')

        if (document) document = document.replace(/[^a-zA-Z0-9 ]/g, '')

        return res.send(await Client.create({ name, corporate_name, document, email, due_day }))
    }

    static async update(req: clientRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        let { name, corporate_name, document, email, due_day } = req.body

        if (document) document = document.replace(/[^a-zA-Z0-9 ]/g, '')

        const client = await Client.findByPk(id)

        await client?.update({ name, corporate_name, document, email, due_day })
        await client?.save()

        return res.send(client)
    }
}

export default clientController
