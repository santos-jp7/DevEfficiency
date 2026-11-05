import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'

import Lead, { LEAD_SOURCES, LEAD_STATUSES } from '../../models/Lead'
import Opportunity from '../../models/Opportunity'
import CrmActivity from '../../models/CrmActivity'
import Client from '../../models/Client'
import Seller from '../../models/Seller'
import { blank, findClientMatches, findLeadMatches } from '../../utils/crm'

type Req = FastifyRequest<{ Params: { id: string }; Body: any; Querystring: any }>

const FIELDS = ['name', 'company', 'document', 'email', 'phone', 'whatsapp', 'source', 'status', 'notes', 'ClientId', 'SellerId'] as const

async function leadPatch(body: any): Promise<{ patch?: any; error?: string }> {
    const patch: any = {}
    for (const f of FIELDS) if (body && f in body) patch[f] = blank(body[f]) ? null : body[f]

    if ('name' in patch && !patch.name) return { error: 'Informe o nome do lead.' }
    if (patch.source === null) delete patch.source
    if (patch.status === null) delete patch.status
    if (patch.source && !LEAD_SOURCES.includes(patch.source)) return { error: 'Origem inválida.' }
    if (patch.status && !LEAD_STATUSES.includes(patch.status)) return { error: 'Status inválido.' }
    if (patch.ClientId && !(await Client.findByPk(patch.ClientId))) return { error: 'Cliente não encontrado.' }
    if (patch.SellerId && !(await Seller.findByPk(patch.SellerId))) return { error: 'Vendedor não encontrado.' }

    return { patch }
}

class leadsController {
    static async index(req: Req, res: FastifyReply) {
        const { q, status, source, SellerId } = (req.query || {}) as any
        const where: any = {}
        if (status) where.status = String(status).split(',')
        if (source) where.source = source
        if (SellerId) where.SellerId = SellerId
        if (q) {
            const like = { [Op.like]: `%${q}%` }
            where[Op.or] = [{ name: like }, { company: like }, { email: like }, { phone: like }, { document: like }]
        }

        const leads = await Lead.findAll({
            where,
            include: [Client, Seller, { model: Opportunity, attributes: ['id', 'stage', 'estimated_value'] }],
            order: [['createdAt', 'DESC']],
        })
        return res.send(leads)
    }

    // Possíveis duplicados (cadastro e conversão): clientes e leads com mesmo CNPJ/CPF, e-mail ou telefone.
    // GET /crm/leads/check?document=&email=&phone=&whatsapp=&exclude=  ou  GET /crm/leads/:id/matches
    static async check(req: Req, res: FastifyReply) {
        const q = (req.query || {}) as any
        const input = { document: q.document, email: q.email, phone: q.phone, whatsapp: q.whatsapp }
        return res.send({ clients: await findClientMatches(input), leads: await findLeadMatches(input, q.exclude ? Number(q.exclude) : null) })
    }

    static async matches(req: Req, res: FastifyReply) {
        const lead = await Lead.findByPk(req.params.id)
        if (!lead) return res.status(404).send({ message: 'Lead não encontrado.' })
        return res.send({ clients: await findClientMatches(lead), leads: await findLeadMatches(lead, lead.id) })
    }

    static async show(req: Req, res: FastifyReply) {
        const lead = await Lead.findByPk(req.params.id, {
            include: [Client, Seller, Opportunity, { model: CrmActivity }],
            order: [[CrmActivity, 'createdAt', 'DESC']],
        })
        if (!lead) return res.status(404).send({ message: 'Lead não encontrado.' })
        return res.send(lead)
    }

    static async store(req: Req, res: FastifyReply) {
        const { patch, error } = await leadPatch(req.body)
        if (error) return res.status(400).send({ message: error })
        if (!patch.name) return res.status(400).send({ message: 'Informe o nome do lead.' })

        const lead = await Lead.create(patch)
        return res.status(201).send(lead)
    }

    static async update(req: Req, res: FastifyReply) {
        const lead = await Lead.findByPk(req.params.id)
        if (!lead) return res.status(404).send({ message: 'Lead não encontrado.' })

        const { patch, error } = await leadPatch(req.body)
        if (error) return res.status(400).send({ message: error })

        await lead.update(patch)
        return res.send(lead)
    }

    static async destroy(req: Req, res: FastifyReply) {
        const lead = await Lead.findByPk(req.params.id)
        if (!lead) return res.status(404).send({ message: 'Lead não encontrado.' })
        if ((await Opportunity.count({ where: { LeadId: lead.id } })) > 0)
            return res.status(400).send({ message: 'Lead com oportunidades: marque como Descartado em vez de excluir.' })

        await CrmActivity.destroy({ where: { LeadId: lead.id } })
        await lead.destroy()
        return res.status(204).send()
    }
}

export default leadsController
