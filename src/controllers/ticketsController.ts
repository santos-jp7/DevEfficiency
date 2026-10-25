import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'

import Ticket, { TICKET_STATUSES, TICKET_TYPES, TicketStatus } from '../models/Ticket'
import TicketMessage from '../models/TicketMessage'
import Client from '../models/Client'
import Project from '../models/Project'
import Contact from '../models/Contact'
import Service_order from '../models/Service_order'
import { TicketError, addMessage, changeStatus, convertToServiceOrder, createTicket } from '../utils/tickets'

type Req = FastifyRequest<{ Params: { id: string }; Querystring: Record<string, any>; Body: Record<string, any> }>

const authorOf = (req: any): string | null => req.__user?.user?.username || null

const fail = (res: FastifyReply, err: unknown) => {
    if (err instanceof TicketError) return res.status(400).send({ message: err.message })
    throw err
}

const include = [Client, Project, Contact, { model: Service_order, attributes: ['id', 'subject', 'status'] }]

class ticketsController {
    static async index(req: Req, res: FastifyReply) {
        const { status, ClientId, q, page = '1', limit = '20' } = req.query

        const where: any = {}
        if (status) where.status = { [Op.in]: String(status).split(',') }
        if (ClientId) where.ClientId = ClientId
        if (q) where[Op.or] = [{ subject: { [Op.like]: `%${q}%` } }, { requester_name: { [Op.like]: `%${q}%` } }]

        const size = Math.min(Number(limit) || 20, 200)

        const { count, rows } = await Ticket.findAndCountAll({
            where,
            include: [Client, Project],
            order: [['id', 'DESC']],
            limit: size,
            offset: (Math.max(Number(page), 1) - 1) * size,
        })

        return res.send({ data: rows, total: count, page: Number(page), limit: size })
    }

    static async summary(req: Req, res: FastifyReply) {
        const rows = await Ticket.findAll({ attributes: ['status'] })

        const counts: Record<string, number> = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0]))
        rows.forEach((r) => counts[r.status]++)

        return res.send({
            ...counts,
            // O que pede ação da equipe.
            needs_attention: counts['Aberto'] + counts['Em análise'],
        })
    }

    static async show(req: Req, res: FastifyReply) {
        const ticket = await Ticket.findByPk(req.params.id, { include })
        if (!ticket) return res.status(404).send({ message: 'Chamado não encontrado.' })

        const messages = await TicketMessage.findAll({ where: { TicketId: ticket.id }, order: [['id', 'ASC']] })

        return res.send({ ...ticket.toJSON(), messages })
    }

    static async store(req: Req, res: FastifyReply) {
        const b = req.body

        if (b.type && !(TICKET_TYPES as readonly string[]).includes(b.type)) return res.status(400).send({ message: 'Tipo inválido.' })

        try {
            let { requester_name, requester_email } = b

            // Solicitante escolhido entre os contatos do cliente.
            if (b.ContactId && (!requester_email || !requester_name)) {
                const contact = await Contact.findByPk(b.ContactId)
                if (contact) {
                    requester_name = requester_name || contact.name
                    requester_email = requester_email || contact.email
                }
            }

            const ticket = await createTicket({ ...b, requester_name, requester_email, channel: 'Manual' } as any)
            return res.status(201).send(ticket)
        } catch (err) {
            return fail(res, err)
        }
    }

    static async update(req: Req, res: FastifyReply) {
        const ticket = await Ticket.findByPk(req.params.id)
        if (!ticket) return res.status(404).send({ message: 'Chamado não encontrado.' })

        const { subject, description, type, gravidade, ClientId, ProjectId, ContactId, requester_name, requester_email } = req.body
        const patch: any = { subject, description, type, gravidade, ClientId, ProjectId, ContactId, requester_name, requester_email }
        Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k])
        Object.keys(patch).forEach((k) => patch[k] === '' && (patch[k] = null))

        if (patch.subject === null) return res.status(400).send({ message: 'Informe o assunto do chamado.' })

        await ticket.update(patch)
        return res.send(ticket)
    }

    static async message(req: Req, res: FastifyReply) {
        const ticket = await Ticket.findByPk(req.params.id)
        if (!ticket) return res.status(404).send({ message: 'Chamado não encontrado.' })

        try {
            const message = await addMessage(ticket, {
                body: req.body.body,
                internal: !!req.body.internal,
                author_type: 'equipe',
                author_name: authorOf(req),
            })
            return res.status(201).send(message)
        } catch (err) {
            return fail(res, err)
        }
    }

    static async status(req: Req, res: FastifyReply) {
        const ticket = await Ticket.findByPk(req.params.id)
        if (!ticket) return res.status(404).send({ message: 'Chamado não encontrado.' })

        const status = req.body.status as TicketStatus
        if (!TICKET_STATUSES.includes(status) || status === 'Convertido em OS')
            return res.status(400).send({ message: 'Situação inválida. Para converter em OS use a ação de conversão.' })

        try {
            return res.send(await changeStatus(ticket, status, req.body.note, authorOf(req)))
        } catch (err) {
            return fail(res, err)
        }
    }

    static async convert(req: Req, res: FastifyReply) {
        const ticket = await Ticket.findByPk(req.params.id)
        if (!ticket) return res.status(404).send({ message: 'Chamado não encontrado.' })

        try {
            const os = await convertToServiceOrder(ticket, req.body, authorOf(req))
            return res.status(201).send({ ServiceOrderId: os.id, ticket })
        } catch (err) {
            return fail(res, err)
        }
    }
}

export default ticketsController
