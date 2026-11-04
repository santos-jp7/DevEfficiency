import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'
import moment from 'moment'

import CrmActivity, { ACTIVITY_TYPES } from '../../models/CrmActivity'
import Lead from '../../models/Lead'
import Opportunity from '../../models/Opportunity'
import Client from '../../models/Client'
import { blank } from '../../utils/crm'

type Req = FastifyRequest<{ Params: { id: string }; Body: any; Querystring: any }>

async function activityPatch(body: any, current?: CrmActivity | null): Promise<{ patch?: any; error?: string }> {
    const patch: any = {}

    if ('type' in body && !blank(body.type)) {
        if (!ACTIVITY_TYPES.includes(body.type)) return { error: 'Tipo de atividade inválido.' }
        patch.type = body.type
    }
    if ('subject' in body) {
        if (blank(body.subject)) return { error: 'Informe o assunto da atividade.' }
        patch.subject = String(body.subject).slice(0, 160)
    }
    if ('description' in body) patch.description = blank(body.description) ? null : body.description
    if ('due_at' in body) patch.due_at = blank(body.due_at) ? null : new Date(body.due_at)
    if ('done' in body) patch.done_at = body.done ? current?.done_at || new Date() : null

    for (const [key, model] of [['LeadId', Lead], ['OpportunityId', Opportunity], ['ClientId', Client]] as const) {
        if (!(key in body)) continue
        patch[key] = blank(body[key]) ? null : Number(body[key])
        if (patch[key] && !(await (model as any).findByPk(patch[key]))) return { error: `${key} não encontrado.` }
    }

    // Atividade de uma oportunidade herda lead/cliente para aparecer neles também.
    if (patch.OpportunityId) {
        const opp = await Opportunity.findByPk(patch.OpportunityId)
        if (opp && !('LeadId' in patch)) patch.LeadId = opp.LeadId
        if (opp && !('ClientId' in patch)) patch.ClientId = opp.ClientId
    }

    const linked = ['LeadId', 'OpportunityId', 'ClientId'].some((k) => (k in patch ? patch[k] : (current as any)?.[k]))
    if (!linked) return { error: 'Vincule a atividade a um lead, oportunidade ou cliente.' }

    return { patch }
}

const include = [
    { model: Lead, attributes: ['id', 'name', 'company'] },
    { model: Opportunity, attributes: ['id', 'title', 'stage'] },
    { model: Client, attributes: ['id', 'name'] },
]

class activitiesController {
    static async index(req: Req, res: FastifyReply) {
        const { LeadId, OpportunityId, ClientId, pending } = (req.query || {}) as any
        const where: any = {}
        if (LeadId) where.LeadId = LeadId
        if (OpportunityId) where.OpportunityId = OpportunityId
        if (ClientId) where.ClientId = ClientId
        if (pending === 'true') where.done_at = null

        return res.send(await CrmActivity.findAll({ where, include, order: [['createdAt', 'DESC']] }))
    }

    // Follow-ups pendentes: range=overdue (vencidos) | today (até o fim de hoje) | week (até 7 dias).
    static async followups(req: Req, res: FastifyReply) {
        const { range = 'today' } = (req.query || {}) as any
        const now = moment()
        const until =
            range === 'overdue' ? now.toDate() : range === 'week' ? moment().add(7, 'days').endOf('day').toDate() : moment().endOf('day').toDate()

        // Atividades de oportunidades já ganhas/perdidas não contam como follow-up pendente.
        const items = await CrmActivity.findAll({
            where: {
                done_at: null,
                due_at: { [Op.ne]: null, [Op.lte]: until },
                [Op.or]: [{ OpportunityId: null }, { '$Opportunity.stage$': { [Op.notIn]: ['Ganho', 'Perdido'] } }],
            } as any,
            include,
            order: [['due_at', 'ASC']],
        })

        return res.send({
            overdue: items.filter((a) => a.due_at && a.due_at < now.toDate()).length,
            total: items.length,
            items,
        })
    }

    static async store(req: Req, res: FastifyReply) {
        const { patch, error } = await activityPatch({ subject: '', ...(req.body || {}) })
        if (error) return res.status(400).send({ message: error })
        const activity = await CrmActivity.create(patch)
        return res.status(201).send(await CrmActivity.findByPk(activity.id, { include }))
    }

    static async update(req: Req, res: FastifyReply) {
        const activity = await CrmActivity.findByPk(req.params.id)
        if (!activity) return res.status(404).send({ message: 'Atividade não encontrada.' })
        const { patch, error } = await activityPatch(req.body || {}, activity)
        if (error) return res.status(400).send({ message: error })
        await activity.update(patch)
        return res.send(await CrmActivity.findByPk(activity.id, { include }))
    }

    static async done(req: Req, res: FastifyReply) {
        const activity = await CrmActivity.findByPk(req.params.id)
        if (!activity) return res.status(404).send({ message: 'Atividade não encontrada.' })
        await activity.update({ done_at: activity.done_at ? null : new Date() })
        return res.send(activity)
    }

    static async destroy(req: Req, res: FastifyReply) {
        const activity = await CrmActivity.findByPk(req.params.id)
        if (!activity) return res.status(404).send({ message: 'Atividade não encontrada.' })
        await activity.destroy()
        return res.status(204).send()
    }
}

export default activitiesController
