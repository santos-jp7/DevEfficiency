import { FastifyRequest, FastifyReply } from 'fastify'
import Product from '../models/Product'

import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'
import Protocol_register from '../models/Protocol_register'
import Receipts from '../models/Receipts'

type protocolsRequest = FastifyRequest<{
    Body: Protocol
    Params: Protocol
    Headers: any
}>

class protocolsController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Protocol.findAll())
    }

    static async show(req: protocolsRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(
            await Protocol.findByPk(req.params.id, {
                include: [Protocol_register, { model: Protocol_product, include: [Product] }, Receipts],
            }),
        )
    }

    static async update(req: protocolsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { status } = req.body

        const protocol = await Protocol.findByPk(id)

        if (status == 'Fechado') {
            const total_cost =
                ((await protocol?.getProtocol_registers())?.reduce((sum, v) => sum + v.value, 0) || 0) +
                ((await protocol?.getProtocol_products())?.reduce((sum, v) => sum + v.value, 0) || 0)

            const total_receipt = (await protocol?.getReceipts())?.reduce((sum, v) => sum + v.value, 0) || 0

            if (total_receipt < total_cost)
                throw new Error('Não é possivel finalizar, protocolo com recebimentos pendentes.')
        }

        await protocol?.update({ status })
        await protocol?.save()

        return res.send(protocol)
    }
}

export default protocolsController
