import { FastifyRequest, FastifyReply } from 'fastify'
import * as uuid from 'uuid'

import Protocol_product from '../models/Protocol_product'
import Protocol from '../models/Protocol'
import Product from '../models/Product'
import License from '../models/License'
import db from '../db'

export const MAX_QUANTITY = 500

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

    // `quantity` (padrão 1) cria N linhas de uma vez, cada uma com o mesmo valor unitário e, se o produto gera
    // licença, a sua própria chave. Tudo ou nada (transação): não sobra metade das licenças lançada.
    static async store(req: protocolsProductRequest, res: FastifyReply): Promise<FastifyReply> {
        const { ProductId, value, charge_type, ProtocolId } = req.body
        const quantity = Number((req.body as any).quantity ?? 1)

        if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY)
            return res.status(400).send({ message: `Quantidade deve ser um inteiro entre 1 e ${MAX_QUANTITY}.` })

        const product = await Product.findByPk(ProductId)
        const protocol = await Protocol.findByPk(ProtocolId)
        if (!protocol) return res.status(404).send({ message: 'Protocolo não encontrado.' })

        const t = await db.transaction()

        try {
            const created: Protocol_product[] = []

            for (let i = 0; i < quantity; i++) {
                const protocol_product = await protocol.createProtocol_product({ ProductId, value, charge_type }, { transaction: t })
                if (product?.generate_license) await protocol_product.createLicense({ key: uuid.v4() }, { transaction: t })
                created.push(protocol_product)
            }

            await t.commit()

            if (quantity === 1) return res.send(created[0])
            return res.send({ ...created[0].toJSON(), quantity, ids: created.map((c) => c.id) })
        } catch (error: any) {
            await t.rollback()
            return res.status(400).send({ message: error?.message || 'Não foi possível lançar o produto.' })
        }
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
