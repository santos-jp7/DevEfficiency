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
        const { description, host, username, password, clientId } = req.body

        const client = await Client.findByPk(clientId)
        const credentials = await client?.createCredential({ description, host, username, password })

        return res.send(credentials)

        // return res.send(await Credentials.create({
        //     description, host, username, password, clientId
        // }));
    }

    static async update(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }

    static async destroy(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }
}

export default credentialsController
