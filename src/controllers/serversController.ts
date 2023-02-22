import { FastifyRequest, FastifyReply } from 'fastify'

import Client from '../models/Client'
import Server from '../models/Server'

type serversRequest = FastifyRequest<{
    Body: Server
    Params: Server
    Headers: any
}>

class serversController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Server.findAll())
    }

    static async show(req: serversRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(
            await Server.findByPk(req.params.id, {
                include: [Client],
            }),
        )
    }

    static async store(req: serversRequest, res: FastifyReply): Promise<FastifyReply> {
        const { description, provider, host, username, password, rsa, ClientId } = req.body

        const client = !ClientId ? false : await Client.findByPk(ClientId)

        const credentials = !client
            ? await Server.create({ description, provider, host, username, password, rsa })
            : await client?.createServer({ description, provider, host, username, password, rsa })

        return res.send(credentials)
    }

    static async update(req: serversRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { description, provider, host, username, password, rsa } = req.body

        const credential = await Server.findByPk(id)

        await credential?.update({
            description,
            provider,
            host,
            username,
            password,
            rsa,
        })

        await credential?.save()

        return res.send(credential)
    }

    static async destroy(req: serversRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params

        const credential = await Server.findByPk(id)
        await credential?.destroy()

        return res.status(204).send()
    }
}

export default serversController
