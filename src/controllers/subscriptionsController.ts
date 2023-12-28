import { FastifyRequest, FastifyReply } from 'fastify'

import Subscription from '../models/Subscription'
import Protocol from '../models/Protocol'
import License from '../models/License'
import Project from '../models/Project'
import Client from '../models/Client'

type subscriptionsRequest = FastifyRequest<{
    Body: Subscription
    Params: Subscription
    Querystring: Subscription
    Headers: any
}>

class subscriptionController {
    static async index(req: subscriptionsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { ClientId } = req.query

        if (ClientId) return res.send(await Subscription.findAll({ include: [Project, Client], where: { ClientId } }))
        else return res.send(await Subscription.findAll({ include: [Project, Client] }))
    }

    static async show(req: subscriptionsRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(
            await Subscription.findByPk(req.params.id, {
                include: [Protocol, License, Project, Client],
                order: [[Protocol, 'createdAt', 'desc']],
            }),
        )
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
