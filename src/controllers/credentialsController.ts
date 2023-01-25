import { FastifyRequest, FastifyReply } from 'fastify'

import Client from '../models/Client'
import Credential from '../models/Credential'

type credentialsRequest = FastifyRequest<{
    Body: Credential
    Params: Credential
    Headers: any
}>

class credentialsController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Credential.findAll())
    }

    static async show(req: credentialsRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Credential.findByPk(req.params.id))
    }

    static async store(req: credentialsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { description, host, username, password, ClientId } = req.body

        const client = await Client.findByPk(ClientId)
        const credentials = await client?.createCredential({ description, host, username, password })

        return res.send(credentials)
    }

    static async update(req: credentialsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { description, host, username, password } = req.body

        const credential = await Credential.findByPk(id)

        await credential?.update({
            description,
            host,
            username,
            password,
        })
        await credential?.save()

        return res.send(credential)
    }

    static async destroy(req: credentialsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params

        const credential = await Credential.findByPk(id)
        await credential?.destroy()

        return res.status(204).send()
    }
}

export default credentialsController
