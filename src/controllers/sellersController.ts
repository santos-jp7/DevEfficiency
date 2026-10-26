import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'
import moment from 'moment'

import Seller from '../models/Seller'
import Payable from '../models/Payable'
import Protocol from '../models/Protocol'
import Protocol_register from '../models/Protocol_register'
import Protocol_product from '../models/Protocol_product'
import Client from '../models/Client'
import Service_order from '../models/Service_order'
import Subscription from '../models/Subscription'
import CostCenter from '../models/CostCenter'
import { computeCommission } from '../utils/sellerCommission'
import { round2 } from '../utils/pricing'

type Req = FastifyRequest<{ Params: { id: string }; Querystring: Record<string, any>; Body: Record<string, any> }>

const FIELDS = [
    'name',
    'document',
    'email',
    'phone',
    'pix_key',
    'notes',
    'active',
    'commission_percent',
    'commission_base',
    'applies_to',
    'min_protocol_value',
    'payment_delay_days',
    'CostCenterId',
] as const

function pickFields(body: any) {
    const data: any = {}
    for (const key of FIELDS) if (body && body[key] !== undefined) data[key] = body[key] === '' ? null : body[key]
    return data
}

function validate(data: any, partial = false): string | null {
    if (!partial && !data.name) return 'Informe o nome do vendedor.'
    if (data.name === null) return 'Informe o nome do vendedor.'

    if (data.commission_percent !== undefined) {
        const pct = Number(data.commission_percent)
        if (!(pct >= 0 && pct <= 100)) return 'Percentual de comissão deve estar entre 0 e 100.'
        data.commission_percent = pct
    }
    if (data.commission_base !== undefined && !['liquido', 'bruto'].includes(data.commission_base))
        return 'Base de cálculo inválida.'
    if (data.applies_to !== undefined && !['ambos', 'servicos', 'produtos'].includes(data.applies_to))
        return 'Regra de aplicação inválida.'
    if (data.payment_delay_days !== undefined) {
        const days = Number(data.payment_delay_days)
        if (!(days >= 0)) return 'Prazo de pagamento inválido.'
        data.payment_delay_days = Math.floor(days)
    }

    return null
}

const protocolInclude = [
    Protocol_register,
    Protocol_product,
    Client,
    { model: Service_order, include: [Client] },
    { model: Subscription, include: [Client] },
]

const clientName = (p: any) => p.Client?.name || p.Service_order?.Client?.name || p.Subscription?.Client?.name || null

const origin = (p: any) =>
    p.ServiceOrderId ? `OS #${p.ServiceOrderId}` : p.SubscriptionId ? `Assinatura #${p.SubscriptionId}` : 'Avulso'

class sellersController {
    static async index(req: Req, res: FastifyReply) {
        const sellers = await Seller.findAll({ include: [CostCenter], order: [['name', 'ASC']] })

        const payables = await Payable.findAll({
            where: { SellerId: { [Op.ne]: null as any }, status: { [Op.in]: ['pendente', 'atrasado'] } },
            attributes: ['SellerId', 'value'],
        })

        const pending = new Map<number, number>()
        payables.forEach((p) => {
            const id = p.SellerId as number
            pending.set(id, (pending.get(id) || 0) + Number(p.value))
        })

        return res.send(sellers.map((s) => ({ ...s.toJSON(), pending_commission: round2(pending.get(s.id) || 0) })))
    }

    static async show(req: Req, res: FastifyReply) {
        const seller = await Seller.findByPk(req.params.id, { include: [CostCenter] })
        if (!seller) return res.status(404).send({ message: 'Vendedor não encontrado.' })

        return res.send(seller)
    }

    static async store(req: Req, res: FastifyReply) {
        const data = pickFields(req.body)
        const error = validate(data)
        if (error) return res.status(400).send({ message: error })

        return res.status(201).send(await Seller.create(data))
    }

    static async update(req: Req, res: FastifyReply) {
        const seller = await Seller.findByPk(req.params.id)
        if (!seller) return res.status(404).send({ message: 'Vendedor não encontrado.' })

        const data = pickFields(req.body)
        const error = validate(data, true)
        if (error) return res.status(400).send({ message: error })

        // Novas regras valem para protocolos finalizados daqui para frente; comissões já geradas não mudam.
        await seller.update(data)
        return res.send(seller)
    }

    static async destroy(req: Req, res: FastifyReply) {
        const seller = await Seller.findByPk(req.params.id)
        if (!seller) return res.status(404).send({ message: 'Vendedor não encontrado.' })

        const linked = (await Protocol.count({ where: { SellerId: seller.id } })) + (await Payable.count({ where: { SellerId: seller.id } }))
        if (linked > 0)
            return res.status(400).send({ message: 'Vendedor possui protocolos/comissões vinculados. Desative-o em vez de excluir.' })

        await seller.destroy()
        return res.status(204).send()
    }

    // Relatório do vendedor: protocolos vinculados, comissão gerada/paga/pendente e previsão dos protocolos em andamento.
    static async report(req: Req, res: FastifyReply) {
        const seller = await Seller.findByPk(req.params.id)
        if (!seller) return res.status(404).send({ message: 'Vendedor não encontrado.' })

        const { startDate, endDate } = req.query

        const where: any = { SellerId: seller.id }
        if (startDate || endDate) {
            const range: any = {}
            if (startDate) range[Op.gte] = moment(startDate).startOf('day').toDate()
            if (endDate) range[Op.lte] = moment(endDate).endOf('day').toDate()

            // Período pela data de fechamento; protocolos ainda abertos entram pela data de criação.
            where[Op.or] = [{ closedAt: range }, { closedAt: null, createdAt: range }]
        }

        const protocols = await Protocol.findAll({ where, include: protocolInclude, order: [['createdAt', 'DESC']] })
        const payables = await Payable.findAll({ where: { SellerId: seller.id } })
        const payableByProtocol = new Map(payables.map((p) => [p.ProtocolId as number, p]))

        const rows = protocols.map((p) => {
            const calc = computeCommission(seller, p.Protocol_registers, p.Protocol_products, p.discount_value)
            const payable = payableByProtocol.get(p.id)

            return {
                id: p.id,
                client: clientName(p),
                origin: origin(p),
                status: p.status,
                createdAt: p.createdAt,
                closedAt: p.closedAt,
                protocol_total: calc.protocol_total,
                commission_base: calc.base,
                // Protocolo finalizado: vale o que foi gerado; em andamento: estimativa pelas regras atuais.
                commission: payable ? Number(payable.value) : calc.commission,
                estimated: !payable && p.status !== 'Fechado',
                payable: payable && {
                    id: payable.id,
                    status: payable.status,
                    dueDate: payable.dueDate,
                    paymentDate: payable.paymentDate,
                    value: Number(payable.value),
                },
            }
        })

        const inPeriod = rows.filter((r) => r.payable)
        const sum = (list: { value: number }[]) => round2(list.reduce((s, v) => s + v.value, 0))
        const payableList = inPeriod.map((r) => r.payable!)

        const forecast = rows
            .filter((r) => r.estimated && r.status !== 'Cancelado')
            .reduce((s, r) => s + r.commission, 0)

        // Comissão por mês de fechamento.
        const monthly = new Map<string, { month: string; generated: number; paid: number }>()
        for (const r of inPeriod) {
            const month = moment(r.closedAt || r.createdAt).format('YYYY-MM')
            const row = monthly.get(month) || { month, generated: 0, paid: 0 }
            row.generated = round2(row.generated + r.payable!.value)
            if (r.payable!.status === 'pago') row.paid = round2(row.paid + r.payable!.value)
            monthly.set(month, row)
        }

        return res.send({
            seller,
            period: { startDate: startDate || null, endDate: endDate || null },
            totals: {
                protocols: rows.length,
                closed: rows.filter((r) => r.status === 'Fechado').length,
                in_progress: rows.filter((r) => ['Em aberto', 'Liberado para pagamento'].includes(r.status)).length,
                sales_closed: round2(rows.filter((r) => r.status === 'Fechado').reduce((s, r) => s + r.protocol_total, 0)),
                commission_generated: sum(payableList.filter((p) => p.status !== 'cancelado')),
                commission_paid: sum(payableList.filter((p) => p.status === 'pago')),
                commission_pending: sum(payableList.filter((p) => ['pendente', 'atrasado'].includes(p.status))),
                commission_forecast: round2(forecast),
            },
            monthly: [...monthly.values()].sort((a, b) => b.month.localeCompare(a.month)),
            protocols: rows,
        })
    }

    // Próximos pagamentos de comissão (contas a pagar pendentes do vendedor), do mais próximo ao mais distante.
    static async upcoming(req: Req, res: FastifyReply) {
        const seller = await Seller.findByPk(req.params.id)
        if (!seller) return res.status(404).send({ message: 'Vendedor não encontrado.' })

        const payables = await Payable.findAll({
            where: { SellerId: seller.id, status: { [Op.in]: ['pendente', 'atrasado'] } },
            order: [['dueDate', 'ASC']],
        })

        const today = moment().format('YYYY-MM-DD')
        const limit = moment().add(30, 'days').format('YYYY-MM-DD')
        const dueDate = (p: Payable) => moment(p.dueDate).format('YYYY-MM-DD')

        const items = payables.map((p) => ({
            id: p.id,
            description: p.description,
            ProtocolId: p.ProtocolId,
            value: Number(p.value),
            dueDate: dueDate(p),
            overdue: dueDate(p) < today,
        }))

        return res.send({
            total: round2(items.reduce((s, i) => s + i.value, 0)),
            overdue: round2(items.filter((i) => i.overdue).reduce((s, i) => s + i.value, 0)),
            next_30_days: round2(items.filter((i) => i.dueDate >= today && i.dueDate <= limit).reduce((s, i) => s + i.value, 0)),
            items,
        })
    }
}

export default sellersController
