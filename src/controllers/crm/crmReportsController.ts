import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'
import moment from 'moment'

import Opportunity, { OPEN_STAGES, OPPORTUNITY_STAGES } from '../../models/Opportunity'
import OpportunityStageHistory from '../../models/OpportunityStageHistory'
import Lead from '../../models/Lead'
import Seller from '../../models/Seller'
import { round2 } from '../../utils/pricing'

type Req = FastifyRequest<{ Querystring: Record<string, any> }>

const value = (o: Opportunity) => Number(o.estimated_value) || 0
const weighted = (o: Opportunity) => (value(o) * (Number(o.probability) || 0)) / 100
const pct = (part: number, total: number) => (total > 0 ? round2((part / total) * 100) : 0)
const DAY = 86400000

const NO_LEAD_SOURCE = 'Cliente existente'
const sourceOf = (o: any) => o.Lead?.source || NO_LEAD_SOURCE

type Group = { key: string | number | null; name: string; open_count: number; open_value: number; won: number; won_value: number; lost: number; conversion_rate: number }

function groupBy(open: Opportunity[], won: Opportunity[], lost: Opportunity[], keyOf: (o: any) => [string | number | null, string]): Group[] {
    const map = new Map<string, Group>()
    const get = (o: any) => {
        const [key, name] = keyOf(o)
        const id = String(key)
        if (!map.has(id)) map.set(id, { key, name, open_count: 0, open_value: 0, won: 0, won_value: 0, lost: 0, conversion_rate: 0 })
        return map.get(id)!
    }

    for (const o of open) {
        const g = get(o)
        g.open_count++
        g.open_value = round2(g.open_value + value(o))
    }
    for (const o of won) {
        const g = get(o)
        g.won++
        g.won_value = round2(g.won_value + value(o))
    }
    for (const o of lost) get(o).lost++

    return [...map.values()]
        .map((g) => ({ ...g, conversion_rate: pct(g.won, g.won + g.lost) }))
        .sort((a, b) => b.won_value - a.won_value || b.open_value - a.open_value)
}

// Média de dias em cada etapa, a partir do histórico (a etapa final de uma fechada não conta tempo).
function stageTime(histories: Map<number, OpportunityStageHistory[]>, closed: Opportunity[]) {
    const sums = new Map<string, { days: number; count: number }>()
    for (const o of closed) {
        const list = (histories.get(o.id) || []).slice().sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
        for (let i = 0; i < list.length - 1; i++) {
            const stage = list[i].to_stage
            const days = (+new Date(list[i + 1].createdAt) - +new Date(list[i].createdAt)) / DAY
            const s = sums.get(stage) || { days: 0, count: 0 }
            s.days += Math.max(days, 0)
            s.count++
            sums.set(stage, s)
        }
    }
    return OPEN_STAGES.map((stage) => {
        const s = sums.get(stage)
        return { stage, avg_days: s ? round2(s.days / s.count) : null, samples: s?.count || 0 }
    })
}

class crmReportsController {
    // Relatório de vendas do CRM. Query: startDate/endDate (padrão: mês atual), SellerId, source.
    static async index(req: Req, res: FastifyReply) {
        const q = req.query || {}
        const startDate = q.startDate || moment().startOf('month').format('YYYY-MM-DD')
        const endDate = q.endDate || moment().endOf('month').format('YYYY-MM-DD')
        const from = moment(startDate).startOf('day').toDate()
        const to = moment(endDate).endOf('day').toDate()

        const base: any = {}
        if (q.SellerId) base.SellerId = q.SellerId
        if (q.source) {
            if (q.source === NO_LEAD_SOURCE) base.LeadId = null
            else base['$Lead.source$'] = q.source
        }

        const include = [
            { model: Lead, attributes: ['id', 'source', 'name', 'company'] },
            { model: Seller, attributes: ['id', 'name'] },
        ]
        const find = (where: any) => Opportunity.findAll({ where: { ...base, ...where }, include })

        const [open, won, lost, created] = await Promise.all([
            find({ stage: OPEN_STAGES }),
            find({ stage: 'Ganho', won_at: { [Op.between]: [from, to] } }),
            find({ stage: 'Perdido', lost_at: { [Op.between]: [from, to] } }),
            Opportunity.count({ where: { ...base, createdAt: { [Op.between]: [from, to] } }, include }),
        ])

        // Funil atual (fotografia das abertas).
        const pipelineStages = OPEN_STAGES.map((stage) => {
            const items = open.filter((o) => o.stage === stage)
            return {
                stage,
                count: items.length,
                value: round2(items.reduce((s, o) => s + value(o), 0)),
                weighted: round2(items.reduce((s, o) => s + weighted(o), 0)),
            }
        })

        const wonValue = round2(won.reduce((s, o) => s + value(o), 0))
        const cycles = won.filter((o) => o.won_at).map((o) => (+new Date(o.won_at as Date) - +new Date(o.createdAt)) / DAY)

        const lostReasons = new Map<string, { reason: string; count: number; value: number }>()
        for (const o of lost) {
            const reason = o.lost_reason || 'Sem motivo'
            const r = lostReasons.get(reason) || { reason, count: 0, value: 0 }
            r.count++
            r.value = round2(r.value + value(o))
            lostReasons.set(reason, r)
        }

        const closed = [...won, ...lost]
        const histories = new Map<number, OpportunityStageHistory[]>()
        if (closed.length) {
            const rows = await OpportunityStageHistory.findAll({ where: { OpportunityId: closed.map((o) => o.id) } })
            for (const h of rows) {
                const list = histories.get(h.OpportunityId) || []
                list.push(h)
                histories.set(h.OpportunityId, list)
            }
        }

        // Previsão: abertas com fechamento previsto neste mês e no próximo.
        const forecast = [0, 1].map((offset) => {
            const month = moment().add(offset, 'month')
            const items = open.filter((o) => o.expected_close_date && moment(o.expected_close_date).isSame(month, 'month'))
            return {
                month: month.format('YYYY-MM'),
                count: items.length,
                value: round2(items.reduce((s, o) => s + value(o), 0)),
                weighted: round2(items.reduce((s, o) => s + weighted(o), 0)),
            }
        })

        return res.send({
            filters: { startDate, endDate, SellerId: q.SellerId || null, source: q.source || null },
            stages: OPPORTUNITY_STAGES,
            pipeline: {
                stages: pipelineStages,
                total: {
                    count: open.length,
                    value: round2(open.reduce((s, o) => s + value(o), 0)),
                    weighted: round2(open.reduce((s, o) => s + weighted(o), 0)),
                },
            },
            period: {
                created,
                won: won.length,
                lost: lost.length,
                won_value: wonValue,
                lost_value: round2(lost.reduce((s, o) => s + value(o), 0)),
                conversion_rate: pct(won.length, won.length + lost.length),
                avg_ticket: won.length ? round2(wonValue / won.length) : 0,
                avg_cycle_days: cycles.length ? round2(cycles.reduce((s, d) => s + d, 0) / cycles.length) : null,
            },
            by_seller: groupBy(open, won, lost, (o) => (o.Seller ? [o.Seller.id, o.Seller.name] : [null, 'Sem vendedor'])),
            by_source: groupBy(open, won, lost, (o) => [sourceOf(o), sourceOf(o)]),
            lost_reasons: [...lostReasons.values()].sort((a, b) => b.count - a.count || b.value - a.value),
            stage_time: stageTime(histories, closed),
            forecast,
        })
    }
}

export default crmReportsController
