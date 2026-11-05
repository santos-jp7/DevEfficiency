import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'

import db from '../../db'
import Opportunity, { OPEN_STAGES, OPPORTUNITY_KINDS, OPPORTUNITY_STAGES, STAGE_PROBABILITY } from '../../models/Opportunity'
import OpportunityStageHistory from '../../models/OpportunityStageHistory'
import CrmActivity from '../../models/CrmActivity'
import Lead from '../../models/Lead'
import Client from '../../models/Client'
import Seller from '../../models/Seller'
import Supplier from '../../models/Supplier'
import Service_order from '../../models/Service_order'
import Protocol from '../../models/Protocol'
import {
    CrmInputError,
    blank,
    changeStage,
    currentUserId,
    idleDaysOf,
    resolveUserId,
    lastTouch,
    nextFollowups,
    opportunityFromServiceOrder,
    protocolValues,
    staleDays,
    syncSourceServiceOrder,
    winOpportunity,
} from '../../utils/crm'
import User from '../../models/User'
import { ACTIVITY_TYPES } from '../../models/CrmActivity'
import { CommissionInputError, parseCommissionInput } from '../../utils/commissionInput'

type Req = FastifyRequest<{ Params: { id: string }; Body: any; Querystring: any }>

const include = [
    Lead,
    Client,
    Seller,
    { model: Supplier, as: 'CommissionSupplier' },
    { model: Service_order, attributes: ['id', 'subject', 'status'] },
    { model: Service_order, as: 'SourceServiceOrder', attributes: ['id', 'subject', 'status'] },
    { model: Protocol, attributes: ['id', 'status', 'billing_mode'] },
    { model: User, as: 'Owner', attributes: ['id', 'username'] },
]

// Campos editáveis (etapa muda só por /stage, para gravar histórico e regras de ganho/perda).
async function opportunityPatch(body: any, current?: Opportunity | null) {
    const patch: any = {}

    if ('title' in body) {
        if (blank(body.title)) throw new CrmInputError('Informe o título da oportunidade.')
        patch.title = String(body.title).slice(0, 160)
    }
    if ('estimated_value' in body) {
        const v = blank(body.estimated_value) ? null : Number(body.estimated_value)
        if (v !== null && !(v >= 0)) throw new CrmInputError('Valor estimado inválido.')
        patch.estimated_value = v
    }
    if ('probability' in body && !blank(body.probability)) {
        const p = Number(body.probability)
        if (!(Number.isInteger(p) && p >= 0 && p <= 100)) throw new CrmInputError('Probabilidade deve ser de 0 a 100.')
        patch.probability = p
    }
    if ('expected_close_date' in body) patch.expected_close_date = blank(body.expected_close_date) ? null : body.expected_close_date
    if ('notes' in body) patch.notes = blank(body.notes) ? null : body.notes
    if ('kind' in body && !blank(body.kind)) {
        if (!OPPORTUNITY_KINDS.includes(body.kind)) throw new CrmInputError('Tipo inválido.')
        patch.kind = body.kind
    }
    if ('SellerId' in body) {
        patch.SellerId = blank(body.SellerId) ? null : Number(body.SellerId)
        if (patch.SellerId && !(await Seller.findByPk(patch.SellerId))) throw new CrmInputError('Vendedor não encontrado.')
    }
    if ('LeadId' in body) {
        patch.LeadId = blank(body.LeadId) ? null : Number(body.LeadId)
        if (patch.LeadId && !(await Lead.findByPk(patch.LeadId))) throw new CrmInputError('Lead não encontrado.')
    }
    if ('ClientId' in body) {
        patch.ClientId = blank(body.ClientId) ? null : Number(body.ClientId)
        if (patch.ClientId && !(await Client.findByPk(patch.ClientId))) throw new CrmInputError('Cliente não encontrado.')
    }
    if ('UserId' in body) {
        patch.UserId = blank(body.UserId) ? null : Number(body.UserId)
        if (patch.UserId && !(await User.findByPk(patch.UserId))) throw new CrmInputError('Responsável não encontrado.')
    }

    Object.assign(patch, await parseCommissionInput(body, current))

    const leadId = 'LeadId' in patch ? patch.LeadId : current?.LeadId
    const clientId = 'ClientId' in patch ? patch.ClientId : current?.ClientId
    if (!leadId && !clientId) throw new CrmInputError('Vincule a oportunidade a um lead ou a um cliente.')

    return patch
}

function handle(e: any, res: FastifyReply) {
    if (e instanceof CrmInputError || e instanceof CommissionInputError) return res.status(400).send({ message: e.message })
    throw e
}

class opportunitiesController {
    // Kanban/lista. status=open (padrão) | closed | all; filtros: SellerId, source (do lead), LeadId, ClientId, q.
    static async index(req: Req, res: FastifyReply) {
        const { status = 'open', SellerId, source, LeadId, ClientId, SourceServiceOrderId, UserId, mine, q } = (req.query || {}) as any

        const where: any = {}
        if (status === 'open') where.stage = OPEN_STAGES
        else if (status === 'closed') where.stage = ['Ganho', 'Perdido']
        if (SellerId) where.SellerId = SellerId
        if (LeadId) where.LeadId = LeadId
        if (SourceServiceOrderId) where.SourceServiceOrderId = SourceServiceOrderId
        // Responsável: um usuário específico ou "minhas" (do usuário logado).
        if (UserId) where.UserId = UserId
        else if (mine === '1' || mine === 'true') where.UserId = currentUserId(req)
        // Do cliente: as dele e as que nasceram de lead desse cliente (histórico de antes da conversão).
        if (ClientId) where[Op.and] = [{ [Op.or]: [{ ClientId }, { '$Lead.ClientId$': ClientId }] }]
        if (q) {
            const like = { [Op.like]: `%${q}%` }
            where[Op.or] = [{ title: like }, { '$Lead.name$': like }, { '$Lead.company$': like }, { '$Client.name$': like }]
        }
        if (source) where['$Lead.source$'] = source

        const opportunities = await Opportunity.findAll({
            where,
            include,
            order: [
                ['position', 'ASC'],
                ['updatedAt', 'DESC'],
            ],
        })

        const followups = await nextFollowups(opportunities.map((o) => o.id))
        const values = await protocolValues(opportunities)
        const touch = await lastTouch(opportunities)
        const limitDays = await staleDays()

        return res.send(
            opportunities.map((o) => ({
                ...o.toJSON(),
                next_followup: followups.get(o.id) || null,
                // Total do protocolo ligado (convertida ou vinda de OS); null = só a estimativa.
                protocol_value: values.get(o.id) ?? null,
                // Dias sem movimento (etapa/atividade); parada = aberta além do limite crm_stale_days.
                idle_days: idleDaysOf(touch.get(o.id)),
                stale: OPEN_STAGES.includes(o.stage as any) && idleDaysOf(touch.get(o.id)) >= limitDays,
            })),
        )
    }

    // Funil paginado: totais (quantidade, valor real, ponderado) de cada etapa calculados no servidor e só as N primeiras
    // de cada coluna. Query: q, SellerId, source, UserId | mine, closedDays (Ganho/Perdido recentes, padrão 30),
    // limit (por coluna, padrão 50); stage + offset para "carregar mais" de uma coluna.
    static async board(req: Req, res: FastifyReply) {
        const { q, SellerId, source, UserId, mine, closedDays = 30, limit = 50, stage: onlyStage, offset = 0 } = (req.query || {}) as any
        const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 200)
        const since = new Date(Date.now() - Math.max(Number(closedDays) || 30, 1) * 86400000)

        const base: any = {}
        if (SellerId) base.SellerId = SellerId
        if (UserId) base.UserId = UserId
        else if (mine === '1' || mine === 'true') base.UserId = currentUserId(req)
        if (source) base['$Lead.source$'] = source
        if (q) {
            const like = { [Op.like]: `%${q}%` }
            base[Op.or] = [{ title: like }, { '$Lead.name$': like }, { '$Lead.company$': like }, { '$Client.name$': like }]
        }
        const light = [
            { model: Lead, attributes: ['id', 'name', 'company', 'source'] },
            { model: Client, attributes: ['id', 'name'] },
        ]

        const stages = onlyStage ? [onlyStage] : OPPORTUNITY_STAGES
        const columns: Record<string, any> = {}
        const limitDays = await staleDays()

        for (const stage of stages) {
            const where: any = { ...base, stage }
            if (stage === 'Ganho') where.won_at = { [Op.gte]: since }
            if (stage === 'Perdido') where.lost_at = { [Op.gte]: since }

            // Totais: leve (sem includes pesados) sobre a coluna inteira.
            const all = await Opportunity.findAll({
                where,
                include: light,
                attributes: ['id', 'estimated_value', 'probability', 'ProtocolId', 'SourceServiceOrderId'],
            })
            const values = await protocolValues(all)
            const val = (o: Opportunity) => values.get(o.id) ?? (Number(o.estimated_value) || 0)

            const rows = await Opportunity.findAll({
                where,
                include,
                order: [
                    ['position', 'ASC'],
                    ['updatedAt', 'DESC'],
                ],
                limit: pageSize,
                offset: Number(offset) || 0,
                subQuery: false,
            })
            const followups = await nextFollowups(rows.map((o) => o.id))
            const touch = await lastTouch(rows)
            const pageValues = await protocolValues(rows)

            columns[stage] = {
                count: all.length,
                value: Math.round(all.reduce((s, o) => s + val(o), 0) * 100) / 100,
                weighted: Math.round(all.reduce((s, o) => s + (val(o) * (Number(o.probability) || 0)) / 100, 0) * 100) / 100,
                has_more: (Number(offset) || 0) + rows.length < all.length,
                items: rows.map((o) => ({
                    ...o.toJSON(),
                    next_followup: followups.get(o.id) || null,
                    protocol_value: pageValues.get(o.id) ?? null,
                    idle_days: idleDaysOf(touch.get(o.id)),
                    stale: OPEN_STAGES.includes(o.stage as any) && idleDaysOf(touch.get(o.id)) >= limitDays,
                })),
            }
        }

        return res.send({ columns, stale_days: limitDays, closed_days: Number(closedDays) || 30, limit: pageSize })
    }

    static async show(req: Req, res: FastifyReply) {
        const opportunity = await Opportunity.findByPk(req.params.id, {
            include: [...include, OpportunityStageHistory, CrmActivity],
            order: [
                [OpportunityStageHistory, 'createdAt', 'ASC'],
                [CrmActivity, 'createdAt', 'DESC'],
            ],
        })
        if (!opportunity) return res.status(404).send({ message: 'Oportunidade não encontrada.' })
        const values = await protocolValues([opportunity])
        return res.send({ ...opportunity.toJSON(), protocol_value: values.get(opportunity.id) ?? null })
    }

    static async store(req: Req, res: FastifyReply) {
        try {
            const body = (req.body || {}) as any
            const patch = await opportunityPatch({ title: body.title ?? '', ...body })
            const stage = OPEN_STAGES.includes(body.stage) ? body.stage : 'Novo'

            // Lead de cliente existente: a oportunidade já nasce ligada ao cliente.
            if (patch.LeadId && !patch.ClientId) {
                const lead = await Lead.findByPk(patch.LeadId)
                if (lead?.ClientId) patch.ClientId = lead.ClientId
                if (lead?.SellerId && !('SellerId' in patch)) patch.SellerId = lead.SellerId
            }

            const t = await db.transaction()
            try {
                const userId = await resolveUserId(req)
                const opportunity = await Opportunity.create(
                    {
                        UserId: userId,
                        CreatedById: userId,
                        ...patch,
                        stage,
                        probability: patch.probability ?? STAGE_PROBABILITY[stage as keyof typeof STAGE_PROBABILITY],
                        stage_changed_at: new Date(),
                    },
                    { transaction: t },
                )
                await OpportunityStageHistory.create({ OpportunityId: opportunity.id, from_stage: null, to_stage: stage }, { transaction: t })
                await t.commit()
                return res.status(201).send(await Opportunity.findByPk(opportunity.id, { include }))
            } catch (e) {
                await t.rollback()
                throw e
            }
        } catch (e) {
            return handle(e, res)
        }
    }

    static async update(req: Req, res: FastifyReply) {
        const opportunity = await Opportunity.findByPk(req.params.id)
        if (!opportunity) return res.status(404).send({ message: 'Oportunidade não encontrada.' })

        try {
            const patch = await opportunityPatch(req.body || {}, opportunity)
            await opportunity.update(patch)
            return res.send(await Opportunity.findByPk(opportunity.id, { include }))
        } catch (e) {
            return handle(e, res)
        }
    }

    // Mudança de etapa (kanban). Body: { stage, lost_reason?, lost_details?, probability?, position? }.
    static async stage(req: Req, res: FastifyReply) {
        const opportunity = await Opportunity.findByPk(req.params.id)
        if (!opportunity) return res.status(404).send({ message: 'Oportunidade não encontrada.' })

        const { stage, position, next_followup, ...extra } = (req.body || {}) as any
        if (!OPPORTUNITY_STAGES.includes(stage)) return res.status(400).send({ message: 'Etapa inválida.' })

        // Próximo passo junto com a mudança de etapa (o funil pede um follow-up quando não há nenhum pendente).
        let followup: any = null
        if (next_followup && typeof next_followup === 'object') {
            if (blank(next_followup.subject) || blank(next_followup.due_at))
                return res.status(400).send({ message: 'Informe assunto e data do próximo follow-up.' })
            if (next_followup.type && !ACTIVITY_TYPES.includes(next_followup.type)) return res.status(400).send({ message: 'Tipo de atividade inválido.' })
            followup = {
                type: next_followup.type || 'Tarefa',
                subject: String(next_followup.subject).slice(0, 160),
                description: next_followup.description || null,
                due_at: new Date(next_followup.due_at),
            }
        }

        const from = opportunity.stage
        const t = await db.transaction()
        try {
            await changeStage(opportunity, stage, extra, t)
            if (!blank(position)) await opportunity.update({ position: Number(position) }, { transaction: t })
            if (followup)
                await CrmActivity.create(
                    {
                        ...followup,
                        OpportunityId: opportunity.id,
                        LeadId: opportunity.LeadId ?? null,
                        ClientId: opportunity.ClientId ?? null,
                        UserId: opportunity.UserId ?? (await resolveUserId(req)),
                        CreatedById: await resolveUserId(req),
                    },
                    { transaction: t },
                )
            await t.commit()
        } catch (e) {
            await t.rollback()
            return handle(e, res)
        }

        // OS de origem acompanha o desfecho (ganho → fila; perda → cancelada).
        const sync = from !== stage ? await syncSourceServiceOrder(opportunity, stage, from) : {}

        const json: any = (await Opportunity.findByPk(opportunity.id, { include }))!.toJSON()
        return res.send(sync.warning ? { ...json, warning: sync.warning } : json)
    }

    // Ganhar: cria o cliente (se for lead) e gera OS, protocolo avulso ou nada. Body: WinInput (utils/crm.ts).
    static async win(req: Req, res: FastifyReply) {
        const opportunity = await Opportunity.findByPk(req.params.id)
        if (!opportunity) return res.status(404).send({ message: 'Oportunidade não encontrada.' })

        try {
            const result = await winOpportunity(opportunity, (req.body || {}) as any)
            return res.status(201).send({ ...result, opportunity: await Opportunity.findByPk(opportunity.id, { include }) })
        } catch (e) {
            return handle(e, res)
        }
    }

    // Envia uma OS em aberto para o funil (cliente, assunto, valor do protocolo, vendedor e cobrança).
    static async fromServiceOrder(req: Req, res: FastifyReply) {
        try {
            const opportunity = await opportunityFromServiceOrder(Number(req.params.id))
            return res.status(201).send(await Opportunity.findByPk(opportunity.id, { include }))
        } catch (e) {
            return handle(e, res)
        }
    }

    // Reordena uma coluna do kanban: { ids: [3, 1, 2] }.
    static async reorder(req: Req, res: FastifyReply) {
        const ids: number[] = Array.isArray((req.body as any)?.ids) ? (req.body as any).ids.map(Number) : []
        await Promise.all(ids.map((id, i) => Opportunity.update({ position: i }, { where: { id } })))
        return res.send({ ok: true })
    }

    static async destroy(req: Req, res: FastifyReply) {
        const opportunity = await Opportunity.findByPk(req.params.id)
        if (!opportunity) return res.status(404).send({ message: 'Oportunidade não encontrada.' })
        if (opportunity.ServiceOrderId || opportunity.ProtocolId)
            return res.status(400).send({ message: 'Oportunidade convertida não pode ser excluída.' })

        await opportunity.destroy()
        return res.status(204).send()
    }
}

export default opportunitiesController
