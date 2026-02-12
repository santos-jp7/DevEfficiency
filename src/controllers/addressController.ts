import { FastifyRequest, FastifyReply } from 'fastify'

import Address from '../models/Address'
import Client from '../models/Client'

type addressRequest = FastifyRequest<{
    Body: Address
    Params: Address
    Headers: any
}>

class addressController {
    static async index(req: addressRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Address.findAll())
    }

    static async show(req: addressRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Address.findByPk(req.params.id))
    }

    static async store(req: addressRequest, res: FastifyReply): Promise<FastifyReply> {
        const { type, street_name, number, complement, neighborhood, city, state, ibge, zip, ClientId } = req.body

        const client = await Client.findByPk(ClientId)

        const address = await client?.createAddress({
            type,
            street_name,
            number,
            complement,
            neighborhood,
            city,
            state,
            ibge,
            zip,
        })

        return res.send(address)
    }

    static async update(req: addressRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { type, street_name, number, complement, neighborhood, city, state, ibge, zip } = req.body

        const address = await Address.findByPk(id)

        await address?.update({ type, street_name, number, complement, neighborhood, city, state, ibge, zip })
        await address?.save()

        return res.send(address)
    }

    static async delete(req: addressRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params

        const address = await Address.findByPk(id)

        await address?.destroy()

        return res.status(204).send()
    }
}

export default addressController
