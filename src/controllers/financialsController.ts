import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'
import Payable from '../models/Payable'
import Receipt from '../models/Receipts'
import Protocol from '../models/Protocol'
import Subscription from '../models/Subscription'
import Service_order from '../models/Service_order'

interface Transaction {
    date: Date
    description: string
    value: number
    type: 'inflow' | 'outflow'
    relatedTo: string
}

type HistoryRequest = FastifyRequest<{
    Querystring: { startDate?: string; endDate?: string }
    Params: any
    Body: any
    Headers: any
}>

class FinancialsController {
    static async index(req: HistoryRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { startDate, endDate } = req.query
            const whereClause: any = {}

            if (startDate && endDate) {
                whereClause[Op.between] = [new Date(startDate), new Date(endDate)]
            }

            // Get all paid payables (outflows)
            const outflows = await Payable.findAll({
                where: {
                    status: 'pago',
                    ...(startDate && endDate && { paymentDate: whereClause }),
                },
                include: [{ all: true }],
            })

            // Get all receipts (inflows)
            const inflows = await Receipt.findAll({
                where: {
                    ...(startDate && endDate && { createdAt: whereClause }),
                },
                include: [{ model: Protocol, include: [Subscription, Service_order] }],
            })

            // Standardize outflows

            const formattedOutflows: Transaction[] = outflows.map((p) => ({
                date: p.paymentDate || p.updatedAt,
                description: p.description,
                value: -Math.abs(p.value), // Ensure value is negative
                type: 'outflow',
                relatedTo: (p as any).Supplier?.name || 'N/A',
            }))

            // Standardize inflows
            const formattedInflows: Transaction[] = inflows.map((r) => ({
                date: r.createdAt,
                description: `${r.note || ''}`,
                value: r.value, // Ensure value is positive
                type: 'inflow',
                relatedTo:
                    (r as any).Protocol?.Service_order?.subject || (r as any).Protocol?.Subscription?.name || 'N/A',
            }))

            // Combine and sort
            const history = [...formattedOutflows, ...formattedInflows].sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
            )

            return res.send(history)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }
}

export default FinancialsController
