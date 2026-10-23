import { FastifyRequest, FastifyReply } from 'fastify'

import Client from '../models/Client'
import Contact from '../models/Contact'
import Credential from '../models/Credential'
import Project from '../models/Project'
import Server from '../models/Server'
import Config from '../models/Config'
import ClientSlaConfig from '../models/ClientSlaConfig'

type clientRequest = FastifyRequest<{
    Body: Client
    Params: Client
    Headers: any
}>
import Billing from '../models/Billing'
import Address from '../models/Address'

// Valida os campos de parceria; retorna a mensagem de erro ou os valores normalizados.
function parsePartner(
    body: Client,
): { error: string } | { is_partner?: boolean; partner_discount_percent?: number | null; partner_since?: string | null } {
    // Chamadas que não enviam campos de parceria (ex.: MCP) não alteram o status atual.
    if (body.is_partner === undefined && body.partner_discount_percent === undefined && body.partner_since === undefined)
        return {}

    const is_partner = !!body.is_partner
    const raw = body.partner_discount_percent as unknown
    const percent = raw === null || raw === undefined || raw === '' ? null : Number(raw)

    if (percent !== null && (isNaN(percent) || percent < 0 || percent > 100))
        return { error: 'Desconto de parceiro deve estar entre 0 e 100.' }

    if (is_partner && percent === null) return { error: 'Informe o desconto de parceiro (%) para cliente parceiro.' }

    return { is_partner, partner_discount_percent: percent, partner_since: body.partner_since || null }
}

class clientController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Client.findAll())
    }

    static async show(req: clientRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(
            await Client.findByPk(req.params.id, {
                include: [Credential, Project, Server, Contact, Address, { model: ClientSlaConfig, as: 'SlaConfigs' }],
            }),
        )
    }

    static async store(req: clientRequest, res: FastifyReply): Promise<FastifyReply> {
        let { name, corporate_name, document, email, due_day } = req.body

        let default_day_due = await Config.findOne({ where: { type: 'default_day_due' } })

        due_day = due_day || parseInt(default_day_due?.value || '20')

        if (document) document = document.replace(/[^a-zA-Z0-9 ]/g, '')

        const partner = parsePartner(req.body)
        if ('error' in partner) return res.status(400).send({ message: partner.error })

        return res.send(await Client.create({ name, corporate_name, document, email, due_day, ...partner }))
    }

    static async update(req: clientRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        let { name, corporate_name, document, email, due_day } = req.body

        if (document) document = document.replace(/[^a-zA-Z0-9 ]/g, '')

        const partner = parsePartner(req.body)
        if ('error' in partner) return res.status(400).send({ message: partner.error })

        const client = await Client.findByPk(id)

        await client?.update({ name, corporate_name, document, email, due_day, ...partner })
        await client?.save()

        return res.send(client)
    }
}

export default clientController
