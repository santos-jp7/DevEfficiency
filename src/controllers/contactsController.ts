import { FastifyRequest, FastifyReply } from 'fastify'

import Client from '../models/Client'
import Contact from '../models/Contact'

type contactsRequest = FastifyRequest<{
    Body: Contact
    Params: Contact
    Headers: any
}>

class contactsController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Contact.findAll())
    }

    static async show(req: contactsRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Contact.findByPk(req.params.id))
    }

    static async store(req: contactsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { name, number, email, whatsapp, ClientId } = req.body

        const client = await Client.findByPk(ClientId)
        const contact = await client?.createContact({ name, number, email, whatsapp })

        return res.send(contact)
    }

    static async update(req: contactsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { name, number, email, whatsapp } = req.body

        const contact = await Contact.findByPk(id)

        await contact?.update({
            name,
            number,
            email,
            whatsapp,
        })
        await contact?.save()

        return res.send(contact)
    }

    static async destroy(req: contactsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params

        const contact = await Contact.findByPk(id)
        await contact?.destroy()

        return res.status(204).send()
    }
}

export default contactsController
