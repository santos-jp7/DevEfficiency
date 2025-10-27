import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'
import Payable from '../models/Payable'
import Receipt from '../models/Receipts'
import Protocol from '../models/Protocol'
import Subscription from '../models/Subscription'
import Service_order from '../models/Service_order'
import BankTransfer from '../models/BankTransfer'
import moment from 'moment'

interface Transaction {
    date: Date
    description: string
    value: number
    type: 'inflow' | 'outflow'
    relatedTo: string
    bankAccountId?: number
    showInSummary?: boolean
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
                showInSummary: true,
            }))

            // Standardize inflows
            const formattedInflows: Transaction[] = inflows.map((r) => ({
                date: r.createdAt,
                description: `${r.note || ''}`,
                value: r.value, // Ensure value is positive
                type: 'inflow',
                relatedTo:
                    (r as any).Protocol?.Service_order?.subject || (r as any).Protocol?.Subscription?.name || 'N/A',
                showInSummary: true,
            }))

            // Get all bank transfers
            const bankTransfers = await BankTransfer.findAll({
                where: {
                    ...(startDate && endDate && { date: whereClause }),
                },
                include: [{ all: true }],
            })

            // Standardize bank transfers
            const formattedBankTransfers: Transaction[] = bankTransfers.flatMap((t) => [
                {
                    date: moment(t.date).subtract(1, `minute`).toDate(),
                    description: `${(t as any).SourceAccount?.name}: Transferência para ${
                        (t as any).DestinationAccount?.name
                    }`,
                    value: -Math.abs(t.amount),
                    type: 'outflow',
                    relatedTo: 'Transferência entre contas',
                    showInSummary: false,
                },
                {
                    date: t.date,
                    description: `${(t as any).DestinationAccount?.name}: Recebimento de ${
                        (t as any).SourceAccount?.name
                    }`,
                    value: Math.abs(t.amount),
                    type: 'inflow',
                    relatedTo: 'Transferência entre contas',
                    showInSummary: false,
                },
            ])

            // Combine and sort
            const history = [...formattedOutflows, ...formattedInflows, ...formattedBankTransfers].sort(
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
