import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'
import moment from 'moment'

import Billing from '../models/Billing'
import Client from '../models/Client'
import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'
import Protocol_register from '../models/Protocol_register'
import Payable from '../models/Payable'
import Seller from '../models/Seller'
import Subscription from '../models/Subscription'
import Project from '../models/Project'
import { round2 } from '../utils/pricing'
import { nowInBusinessTimezone } from '../utils/payablesAlert'

type Req = FastifyRequest<{ Querystring: Record<string, any> }>

const BUCKETS = [
    { key: 'd1_15', label: '1–15 dias', min: 1, max: 15 },
    { key: 'd16_30', label: '16–30 dias', min: 16, max: 30 },
    { key: 'd31_60', label: '31–60 dias', min: 31, max: 60 },
    { key: 'd60_plus', label: 'Mais de 60 dias', min: 61, max: Infinity },
]

const emptyBuckets = () => Object.fromEntries(BUCKETS.map((b) => [b.key, 0])) as Record<string, number>
const bucketOf = (days: number) => BUCKETS.find((b) => days >= b.min && days <= b.max)!.key

// Valor mensal equivalente: mensal conta cheio, anual divide por 12.
export function monthlyEquivalent(products: { value: number | string; charge_type: string }[]): { cycle: string | null; value: number; mrr: number } {
    const recurring = products.filter((p) => p.charge_type === 'Mensal' || p.charge_type === 'Anual')
    const value = recurring.reduce((s, p) => s + Number(p.value || 0), 0)
    const annual = recurring.some((p) => p.charge_type === 'Anual')

    return { cycle: recurring.length ? (annual ? 'Anual' : 'Mensal') : null, value: round2(value), mrr: round2(annual ? value / 12 : value) }
}

class commercialReportsController {
    // Inadimplência: cobranças vencidas e ainda não pagas, por cliente, com faixas de atraso.
    static async delinquency(req: Req, res: FastifyReply) {
        const { date: today } = nowInBusinessTimezone()
        const statuses = req.query.status ? String(req.query.status).split(',') : ['faturada', 'pendente']

        const billings = await Billing.findAll({
            where: { status: { [Op.in]: statuses }, due_date: { [Op.ne]: null as any } },
            include: [Client],
            order: [['due_date', 'ASC']],
        })

        const clients = new Map<number, any>()
        const totals = { overdue: 0, count: 0, upcoming: 0, buckets: emptyBuckets() }

        for (const billing of billings) {
            const due = moment.utc(billing.due_date as any).format('YYYY-MM-DD')
            const days = moment(today).diff(due, 'days')
            const value = Number(billing.total_value) || 0

            if (days <= 0) {
                totals.upcoming = round2(totals.upcoming + value)
                continue
            }

            const client = (billing as any).Client
            const row = clients.get(billing.ClientId) || {
                ClientId: billing.ClientId,
                client: client?.name || '—',
                total: 0,
                count: 0,
                oldest_days: 0,
                buckets: emptyBuckets(),
                billings: [] as any[],
            }

            row.total = round2(row.total + value)
            row.count++
            row.oldest_days = Math.max(row.oldest_days, days)
            row.buckets[bucketOf(days)] = round2(row.buckets[bucketOf(days)] + value)
            row.billings.push({ id: billing.id, status: billing.status, due_date: due, days_overdue: days, value })
            clients.set(billing.ClientId, row)

            totals.overdue = round2(totals.overdue + value)
            totals.count++
            totals.buckets[bucketOf(days)] = round2(totals.buckets[bucketOf(days)] + value)
        }

        return res.send({
            as_of: today,
            bucket_labels: Object.fromEntries(BUCKETS.map((b) => [b.key, b.label])),
            totals: { ...totals, clients: clients.size },
            clients: [...clients.values()].sort((a, b) => b.total - a.total),
        })
    }

    // Vendas (protocolos finalizados no período) por vendedor × sem vendedor (Codlinx) e comissões.
    static async sales(req: Req, res: FastifyReply) {
        const startDate = req.query.startDate || moment().startOf('month').format('YYYY-MM-DD')
        const endDate = req.query.endDate || moment().endOf('month').format('YYYY-MM-DD')

        const from = moment(startDate).startOf('day').toDate()
        const to = moment(endDate).endOf('day').toDate()

        const protocols = await Protocol.findAll({
            where: { status: 'Fechado', closedAt: { [Op.between]: [from, to] } },
            include: [Protocol_register, Protocol_product, Seller],
        })

        const payables = await Payable.findAll({
            where: { SellerId: { [Op.ne]: null as any }, ProtocolId: { [Op.in]: protocols.map((p) => p.id).concat(0) } },
        })
        const payableOf = new Map(payables.map((p) => [p.ProtocolId as number, p]))

        const groups = new Map<number | 'none', any>()
        const group = (key: number | 'none', name: string) => {
            if (!groups.has(key)) groups.set(key, { SellerId: key === 'none' ? null : key, name, protocols: 0, sales: 0, commission_generated: 0, commission_paid: 0, commission_pending: 0 })
            return groups.get(key)
        }

        let salesTotal = 0

        for (const protocol of protocols) {
            const items =
                protocol.Protocol_registers.reduce((s, r) => s + Number(r.value), 0) +
                protocol.Protocol_products.reduce((s, r) => s + Number(r.value), 0)
            const net = round2(items - (Number(protocol.discount_value) || 0))

            const seller = (protocol as any).Seller as Seller | null
            const g = seller ? group(seller.id, seller.name) : group('none', 'Codlinx (sem vendedor)')

            g.protocols++
            g.sales = round2(g.sales + net)
            salesTotal = round2(salesTotal + net)

            const payable = payableOf.get(protocol.id)
            if (payable && payable.status !== 'cancelado') {
                const value = Number(payable.value)
                g.commission_generated = round2(g.commission_generated + value)
                if (payable.status === 'pago') g.commission_paid = round2(g.commission_paid + value)
                else g.commission_pending = round2(g.commission_pending + value)
            }
        }

        const rows = [...groups.values()]
            .map((g) => ({ ...g, share: salesTotal > 0 ? round2((g.sales / salesTotal) * 100) : 0 }))
            .sort((a, b) => b.sales - a.sales)

        const withSeller = rows.filter((r) => r.SellerId !== null)
        const sum = (list: any[], key: string) => round2(list.reduce((s, r) => s + r[key], 0))
        const salesWithSeller = sum(withSeller, 'sales')

        // Comissões efetivamente pagas no período (independente de quando o protocolo fechou).
        const paid = await Payable.findAll({
            where: { SellerId: { [Op.ne]: null as any }, status: 'pago', paymentDate: { [Op.between]: [startDate, endDate] } },
            include: [Seller],
            order: [['paymentDate', 'ASC']],
        })

        return res.send({
            period: { startDate, endDate },
            totals: {
                protocols: protocols.length,
                sales: salesTotal,
                sales_with_seller: salesWithSeller,
                sales_without_seller: round2(salesTotal - salesWithSeller),
                share_with_seller: salesTotal > 0 ? round2((salesWithSeller / salesTotal) * 100) : 0,
                commission_generated: sum(rows, 'commission_generated'),
                commission_paid_in_period: round2(paid.reduce((s, p) => s + Number(p.value), 0)),
                commission_pending: sum(rows, 'commission_pending'),
            },
            sellers: rows,
            commissions_paid: paid.map((p) => ({
                id: p.id,
                seller: (p as any).Seller?.name || '—',
                description: p.description,
                ProtocolId: p.ProtocolId,
                value: Number(p.value),
                paymentDate: p.paymentDate,
            })),
        })
    }

    // Recorrência: MRR/ARR por assinatura ativa (qualquer status exceto Cancelado).
    static async recurrence(req: Req, res: FastifyReply) {
        const subscriptions = await Subscription.findAll({
            where: { status: { [Op.ne]: 'Cancelado' } },
            include: [Client, Project, { model: Protocol, include: [Protocol_product] }],
        })

        const items = subscriptions
            .map((sub) => {
                // Valores vigentes = protocolo mais recente da assinatura.
                const latest = [...((sub as any).Protocols as Protocol[])].sort((a, b) => b.id - a.id)[0]
                const { cycle, value, mrr } = monthlyEquivalent(latest?.Protocol_products || [])

                return {
                    id: sub.id,
                    name: sub.name || (sub as any).Project?.name || `Assinatura #${sub.id}`,
                    ClientId: sub.ClientId,
                    client: (sub as any).Client?.name || '—',
                    status: sub.status,
                    cycle,
                    value,
                    mrr,
                    dueAt: sub.dueAt,
                }
            })
            .filter((i) => i.cycle)
            .sort((a, b) => b.mrr - a.mrr)

        const byClient = new Map<number, { ClientId: number; client: string; subscriptions: number; mrr: number }>()
        for (const i of items) {
            const row = byClient.get(i.ClientId) || { ClientId: i.ClientId, client: i.client, subscriptions: 0, mrr: 0 }
            row.subscriptions++
            row.mrr = round2(row.mrr + i.mrr)
            byClient.set(i.ClientId, row)
        }

        const mrr = round2(items.reduce((s, i) => s + i.mrr, 0))

        return res.send({
            totals: {
                subscriptions: items.length,
                mrr,
                arr: round2(mrr * 12),
                monthly_plans: items.filter((i) => i.cycle === 'Mensal').length,
                annual_plans: items.filter((i) => i.cycle === 'Anual').length,
                // Assinaturas em atraso: receita recorrente em risco.
                mrr_at_risk: round2(items.filter((i) => i.status === 'Não pago').reduce((s, i) => s + i.mrr, 0)),
            },
            clients: [...byClient.values()].sort((a, b) => b.mrr - a.mrr),
            subscriptions: items,
        })
    }
}

export default commercialReportsController
