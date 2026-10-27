import { FastifyRequest, FastifyReply } from 'fastify'
import db from '../db'

import Subscription from '../models/Subscription'
import Protocol from '../models/Protocol'
import License from '../models/License'
import Project from '../models/Project'
import Client from '../models/Client'
import Protocol_product from '../models/Protocol_product'
import Protocol_register from '../models/Protocol_register'
import Product from '../models/Product'
import { v4 as uuidv4 } from 'uuid'
import { summarizeProtocol, sumSummaries } from '../utils/pricing'
import { MAX_QUANTITY } from './protocolsProductController'

type subscriptionsRequest = FastifyRequest<{
    Body: Subscription
    Params: Subscription
    Querystring: Subscription & { complete?: boolean }
    Headers: any
}>

class subscriptionController {
    static async index(req: subscriptionsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { ClientId, complete } = req.query

        if (ClientId) return res.send(await Subscription.findAll({ 
            include: [Project, Client,
                ...(complete ? [{
                    model: Protocol,
                    include: [Protocol_product]
                }] : [])
            ],
            where: { ClientId } 
        }))
        else return res.send(await Subscription.findAll({ include: [Project, Client, ...(complete ? [{model: Protocol, include: [Protocol_product]}] : [])] }))
    }

    static async show(req: subscriptionsRequest, res: FastifyReply): Promise<FastifyReply> {
        const subscription = await Subscription.findByPk(req.params.id, {
            include: [{ model: Protocol, include: [Protocol_register, Protocol_product] }, License, Project, Client],
            order: [[Protocol, 'createdAt', 'desc']],
        })

        if (!subscription) return res.send(subscription)

        const client = (subscription as any).Client
        const json: any = subscription.toJSON()
        const protocols = (subscription as any).Protocols || []
        json.Protocols = (json.Protocols || []).map((p: any, i: number) => ({
            ...p,
            pricing: summarizeProtocol(protocols[i], client),
        }))

        return res.send({
            ...json,
            pricing: sumSummaries(
                protocols.map((p: any) => summarizeProtocol(p, client)),
                client,
            ),
        })
    }

    static async store(req: subscriptionsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { name, dueAt, ClientId, ProjectId, products } = req.body as any
        const t = await db.transaction()
        try {
            const subscription = await Subscription.create(
                { name, dueAt, ClientId, ProjectId, status: 'Pendente' },
                { transaction: t },
            )

            const protocol = await Protocol.create(
                { status: 'Em aberto', SubscriptionId: subscription.id },
                { transaction: t },
            )

            if (Array.isArray(products) && products.length > 0) {
                for (const p of products) {
                    // Quantidade N = N itens com o mesmo valor unitário; cada um com sua licença quando o produto gera.
                    const quantity = Number(p.quantity ?? 1)
                    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY)
                        throw new Error(`Quantidade deve ser um inteiro entre 1 e ${MAX_QUANTITY}.`)

                    const product = await Product.findByPk(p.ProductId, { transaction: t })

                    for (let i = 0; i < quantity; i++) {
                        const item = await Protocol_product.create(
                            { ProductId: p.ProductId, charge_type: p.charge_type, value: p.value, ProtocolId: protocol.id },
                            { transaction: t },
                        )
                        if (product?.generate_license) await item.createLicense({ key: uuidv4(), SubscriptionId: subscription.id }, { transaction: t })
                    }
                }
            }

            await t.commit()
            return res.status(201).send(subscription)
        } catch (err) {
            await t.rollback()
            throw err
        }
    }

    static async update(req: subscriptionsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { name, dueAt, status } = req.body

        const subscription = await Subscription.findByPk(id)
        if (!subscription) throw new Error('Assinatura não encontrada.')

        if (name != subscription.name) subscription.name = name
        if (dueAt != subscription.dueAt) subscription.dueAt = dueAt
        if (status != subscription.status) subscription.status = status

        await subscription?.save()

        return res.send(subscription)
    }
}

export default subscriptionController
