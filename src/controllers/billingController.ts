import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'
import Billing from '../models/Billing'
import BillingProtocol from '../models/BillingProtocol'
import Client from '../models/Client'
import Protocol from '../models/Protocol'
import Service_order from '../models/Service_order'
import Subscription from '../models/Subscription'
import Project from '../models/Project'
import moment from 'moment'

type billingRequest = FastifyRequest<{
    Body: Billing
    Params: Billing
    Headers: any
    Querystring: Billing & {
        startDate: string
        endDate: string
        limit: string
    }
}>

class billingController {
    static async index(req: billingRequest, res: FastifyReply): Promise<FastifyReply> {
        const { startDate, endDate, ClientId, limit } = req.query

        const where: any = {}

        if (ClientId) {
            where.ClientId = ClientId
        }

        if (startDate && endDate) {
            where.due_date = {
                [Op.or]: {
                    [Op.between]: [startDate, endDate],
                    [Op.is]: null,
                },
            }
        }

        const billings = await Billing.findAll({
            include: [Client],
            order: [['createdAt', 'DESC']],
            where,
            ...{ ...(limit ? { limit: parseInt(limit) } : {}) },
        })

        return res.send(billings)
    }

    static async show(req: billingRequest, res: FastifyReply): Promise<FastifyReply> {
        const billing = await Billing.findByPk(req.params.id, {
            include: [
                Client,
                {
                    model: BillingProtocol,
                    include: [
                        {
                            model: Protocol,
                            include: [
                                {
                                    model: Service_order,
                                    include: [Project],
                                },
                                Subscription,
                            ],
                        },
                    ],
                },
            ],
        })
        return res.send(billing)
    }

    // A criação de cobranças é automática via hooks.
    // Este método pode ser usado para uma criação manual excepcional.
    static async store(req: billingRequest, res: FastifyReply): Promise<FastifyReply> {
        const { ClientId, due_date, total_value, status, method, BankAccountId } = req.body
        const billing = await Billing.create({ ClientId, due_date, total_value, status, method, BankAccountId })
        return res.status(201).send(billing)
    }

    static async update(req: billingRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { due_date, method, BankAccountId } = req.body

        const billing = await Billing.findByPk(id)

        if (!billing) {
            return res.status(404).send({ message: 'Cobrança não encontrada' })
        }

        await billing.update({ due_date: moment(due_date).toDate(), method, BankAccountId })

        return res.send(billing)
    }

    static async destroy(req: billingRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params

        const billing = await Billing.findByPk(id)

        if (!billing) {
            return res.status(404).send({ message: 'Cobrança não encontrada' })
        }

        // Apenas cobranças pendentes podem ser excluídas
        if (billing.status !== 'pendente') {
            return res.status(400).send({ message: 'Apenas cobranças pendentes podem ser excluídas' })
        }

        await billing.destroy()

        return res.status(204).send()
    }
}

export default billingController
