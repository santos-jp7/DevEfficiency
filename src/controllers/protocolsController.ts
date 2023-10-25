import { FastifyRequest, FastifyReply } from 'fastify'
import { literal } from 'sequelize'
import Product from '../models/Product'

import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'
import Protocol_register from '../models/Protocol_register'
import Receipts from '../models/Receipts'
import Client from '../models/Client'
import { WhereOptions } from 'sequelize'
import Service_order from '../models/Service_order'

type protocolsRequest = FastifyRequest<{
    Body: Protocol
    Params: Protocol
    Querystring: {
        ClientId: Client['id']
    }
    Headers: any
}>

class protocolsController {
    static async index(req: protocolsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { ClientId } = req.query

        let where: WhereOptions<Protocol> = {}

        if (ClientId) where['$Service_order.ClientId$'] = ClientId

        return res.send(
            await Protocol.findAll({ where, include: [Service_order, Protocol_register, Receipts, Protocol_product] }),
        )
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
