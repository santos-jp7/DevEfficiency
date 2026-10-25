import Ticket, { TicketStatus } from '../models/Ticket'
import TicketMessage from '../models/TicketMessage'
import Client from '../models/Client'
import Project from '../models/Project'
import Service_order from '../models/Service_order'
import { parseEmails } from './resendMail'
import { emailLayout, esc, infoBox, multiline } from './emailTemplates'
import { clientRecipients, getConfigValue, isEnabled, sendClientEmail } from './clientMail'
import { createServiceOrder } from './serviceOrderFactory'

export class TicketError extends Error {}

export type NewTicket = {
    subject: string
    description?: string | null
    type?: Ticket['type']
    gravidade?: Ticket['gravidade']
    channel?: Ticket['channel']
    ClientId?: number | null
    ProjectId?: number | null
    ContactId?: number | null
    requester_name?: string | null
    requester_email?: string | null
}

const OPEN_STATUSES: TicketStatus[] = ['Aberto', 'Em análise', 'Aguardando cliente', 'Respondido']

async function requesterRecipients(ticket: Ticket): Promise<string[]> {
    const own = parseEmails(ticket.requester_email)
    return own.length ? own : clientRecipients(ticket.ClientId)
}

async function greetingOf(ticket: Ticket): Promise<string> {
    if (ticket.requester_name) return `Olá, ${ticket.requester_name}!`
    const client = ticket.ClientId ? await Client.findByPk(ticket.ClientId) : null
    return `Olá, ${client?.corporate_name || client?.name || ''}!`
}

async function emailRequester(ticket: Ticket, stage: string, title: string, subject: string, bodyHtml: string, accent?: string) {
    if (!(await isEnabled('tickets_email_enabled'))) return

    await sendClientEmail({
        kind: 'ticket',
        refType: 'ticket',
        refId: ticket.id,
        stage: `${stage}@${Date.now()}`,
        to: await requesterRecipients(ticket),
        subject: `Chamado #${ticket.id} — ${subject}`.slice(0, 250),
        html: emailLayout({
            title,
            greeting: await greetingOf(ticket),
            body: `${bodyHtml}${infoBox([
                ['Chamado', `#${ticket.id}`],
                ['Assunto', ticket.subject],
                ['Situação', ticket.status],
            ])}<p style="font-size:14px;color:#666">Para complementar, basta responder este e-mail informando o número do chamado.</p>`,
            accent,
        }),
    })
}

// Aviso interno para a equipe (novo chamado / resposta do cliente).
async function notifyTeam(ticket: Ticket, headline: string, text: string) {
    try {
        const to = parseEmails(await getConfigValue('tickets_notify_email', ''))
        if (to.length === 0) return

        const client = ticket.ClientId ? await Client.findByPk(ticket.ClientId) : null

        await sendClientEmail({
            kind: 'ticket_team',
            refType: 'ticket',
            refId: ticket.id,
            stage: `${headline}@${Date.now()}`,
            to,
            subject: `[Chamado #${ticket.id}] ${headline}: ${ticket.subject}`.slice(0, 250),
            html: emailLayout({
                title: headline,
                greeting: 'Equipe,',
                body: `${infoBox([
                    ['Cliente', client?.name || ''],
                    ['Solicitante', [ticket.requester_name, ticket.requester_email].filter(Boolean).join(' · ')],
                    ['Tipo', ticket.type],
                    ['Gravidade', ticket.gravidade || ''],
                    ['Canal', ticket.channel],
                ])}${multiline(text)}`,
            }),
        })
    } catch (err) {
        console.error('[chamados] falha ao avisar a equipe', err)
    }
}

// Ponto único de entrada: o cadastro manual, o painel do cliente e o e-mail (próximas etapas) usam esta função.
export async function createTicket(input: NewTicket): Promise<Ticket> {
    if (!input.subject?.trim()) throw new TicketError('Informe o assunto do chamado.')
    if (!input.ClientId && !input.requester_email) throw new TicketError('Informe o cliente ou o e-mail do solicitante.')

    const ticket = await Ticket.create({
        subject: input.subject.trim(),
        description: input.description || null,
        type: input.type || 'Dúvida',
        gravidade: input.gravidade || null,
        channel: input.channel || 'Manual',
        ClientId: input.ClientId || null,
        ProjectId: input.ProjectId || null,
        ContactId: input.ContactId || null,
        requester_name: input.requester_name || null,
        requester_email: input.requester_email || null,
    })

    if (input.description)
        await TicketMessage.create({
            TicketId: ticket.id,
            author_type: 'cliente',
            author_name: input.requester_name || null,
            body: input.description,
        })

    void emailRequester(
        ticket,
        'aberto',
        'Recebemos seu chamado',
        'Recebido',
        '<p>Recebemos sua solicitação e nossa equipe já vai analisá-la. Você será avisado por e-mail a cada resposta.</p>',
    )
    void notifyTeam(ticket, 'Novo chamado', input.description || ticket.subject)

    return ticket
}

export async function addMessage(
    ticket: Ticket,
    input: { body: string; internal?: boolean; author_type: 'cliente' | 'equipe'; author_name?: string | null },
) {
    const body = input.body?.trim()
    if (!body) throw new TicketError('Escreva a mensagem.')

    const internal = input.author_type === 'equipe' && !!input.internal

    const message = await TicketMessage.create({
        TicketId: ticket.id,
        author_type: input.author_type,
        author_name: input.author_name || null,
        body,
        internal,
    })

    if (internal) return message

    if (input.author_type === 'equipe') {
        if (OPEN_STATUSES.includes(ticket.status)) ticket.status = 'Respondido'
        if (!ticket.first_response_at) ticket.first_response_at = new Date()
        await ticket.save()

        void emailRequester(ticket, 'resposta', 'Nova resposta ao seu chamado', 'Nova resposta', multiline(body))
    } else {
        // Cliente respondeu: volta para a fila da equipe.
        if (['Respondido', 'Aguardando cliente', 'Resolvido'].includes(ticket.status)) {
            ticket.status = 'Em análise'
            ticket.resolvedAt = null
            await ticket.save()
        }
        void notifyTeam(ticket, 'Cliente respondeu', body)
    }

    return message
}

export async function changeStatus(ticket: Ticket, status: TicketStatus, note?: string | null, authorName?: string | null) {
    if (ticket.status === 'Convertido em OS' && status !== 'Cancelado' && status !== 'Resolvido')
        throw new TicketError('Chamado convertido em OS: acompanhe pela OS.')

    const previous = ticket.status
    if (previous === status) return ticket

    ticket.status = status
    ticket.resolvedAt = ['Resolvido', 'Cancelado'].includes(status) ? new Date() : null
    await ticket.save()

    await TicketMessage.create({
        TicketId: ticket.id,
        author_type: 'sistema',
        author_name: authorName || null,
        body: `Situação alterada de "${previous}" para "${status}".${note ? `\n${note}` : ''}`,
        internal: true,
    })

    if (status === 'Resolvido')
        void emailRequester(
            ticket,
            'resolvido',
            'Chamado resolvido',
            'Resolvido',
            `<p>Seu chamado foi resolvido.</p>${note ? multiline(note) : ''}<p>Se ainda precisar de ajuda, é só responder este e-mail.</p>`,
            '#1e8449',
        )

    return ticket
}

// Transforma o chamado em OS (gera protocolo/cobrança normalmente pelo fluxo de OS). Dúvidas e validações
// que não geram cobrança simplesmente não precisam ser convertidas.
export async function convertToServiceOrder(
    ticket: Ticket,
    input: { subject?: string; gravidade?: Ticket['gravidade']; prazo?: string | null; SlaLevelId?: number | null; ProjectId?: number | null },
    authorName?: string | null,
): Promise<Service_order> {
    if (ticket.ServiceOrderId) throw new TicketError(`Chamado já convertido na OS #${ticket.ServiceOrderId}.`)
    if (ticket.status === 'Cancelado') throw new TicketError('Chamado cancelado não pode ser convertido.')
    if (!ticket.ClientId) throw new TicketError('Vincule o chamado a um cliente antes de converter em OS.')

    const ProjectId = input.ProjectId || ticket.ProjectId || null
    if (input.ProjectId && input.ProjectId !== ticket.ProjectId) {
        const project = await Project.findByPk(input.ProjectId)
        if (!project) throw new TicketError('Projeto não encontrado.')
    }

    const os = await createServiceOrder({
        subject: (input.subject || ticket.subject).slice(0, 128),
        description: `Chamado #${ticket.id} (${ticket.type})\n\n${ticket.description || ''}`.slice(0, 255),
        ProjectId,
        ClientId: ticket.ClientId,
        gravidade: input.gravidade ?? ticket.gravidade,
        prazo: input.prazo,
        SlaLevelId: input.SlaLevelId,
    })

    await ticket.update({
        ServiceOrderId: os.id,
        ProjectId,
        status: 'Convertido em OS',
        gravidade: input.gravidade ?? ticket.gravidade,
    })

    await TicketMessage.create({
        TicketId: ticket.id,
        author_type: 'sistema',
        author_name: authorName || null,
        body: `Convertido na OS #${os.id}.`,
        internal: true,
    })

    return os
}

export { esc }
