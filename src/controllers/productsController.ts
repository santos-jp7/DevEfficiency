import { FastifyRequest, FastifyReply } from 'fastify'

import Product from '../models/Product'

type productsRequest = FastifyRequest<{
    Body: Product
    Params: Product
    Headers: any
}>

class productsController {
    static async index(req: productsRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Product.findAll())
    }

    static async show(req: productsRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Product.findByPk(req.params.id))
    }

    static async store(req: productsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { description, value, coust, generate_license } = req.body

        const product = await Product.create({ description, value, coust, generate_license })

        return res.send(product)
    }

    static async update(req: productsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { description, value, coust, generate_license } = req.body

        const product = await Product.findByPk(id)

        await product?.update({ description, value, coust, generate_license })
        await product?.save()

        return res.send(product)
    }
}

export default productsController
