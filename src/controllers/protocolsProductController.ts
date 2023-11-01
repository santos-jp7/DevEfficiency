import { FastifyRequest, FastifyReply } from 'fastify'
import * as uuid from 'uuid'

import Protocol_product from '../models/Protocol_product'
import Protocol from '../models/Protocol'
import Product from '../models/Product'
import License from '../models/License'

type protocolsProductRequest = FastifyRequest<{
    Body: Protocol_product
    Params: Protocol_product
    Headers: any
}>

class protocolsProductController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Protocol_product.findAll())
    }

    static async show(req: protocolsProductRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Protocol_product.findByPk(req.params.id, { include: [License] }))
    }

    static async store(req: protocolsProductRequest, res: FastifyReply): Promise<FastifyReply> {
        const { ProductId, value, charge_type, ProtocolId } = req.body

        const product = await Product.findByPk(ProductId)

        const protocol = await Protocol.findByPk(ProtocolId)
        const protocol_product = await protocol?.createProtocol_product({ ProductId, value, charge_type })

        const key = uuid.v4()
        if (product?.generate_license) await protocol_product?.createLicense({ key })

        return res.send(protocol_product)
    }

    static async update(req: protocolsProductRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { ProductId, value, charge_type } = req.body

        const protocol_product = await Protocol_product.findByPk(id)

        await protocol_product?.update({ ProductId, value, charge_type })
        await protocol_product?.save()

        return res.send(protocol_product)
    }

    static async destroy(req: protocolsProductRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params

        const protocol_product = await Protocol_product.findByPk(id)
        await protocol_product?.destroy()

        return res.status(204).send()
    }
}

export default protocolsProductController
