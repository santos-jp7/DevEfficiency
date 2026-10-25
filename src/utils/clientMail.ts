import { Op } from 'sequelize'

import Client from '../models/Client'
import Contact from '../models/Contact'
import Config from '../models/Config'
import EmailLog from '../models/EmailLog'
import { parseEmails, sendAlertEmail } from './resendMail'

export async function getConfigValue(type: string, fallback: string): Promise<string> {
    const config = await Config.findOne({ where: { type } })
    return config?.value?.trim() ? config.value.trim() : fallback
}

export async function isEnabled(type: string): Promise<boolean> {
    return (await getConfigValue(type, 'true')).toLowerCase() !== 'false'
}

// Contatos do cliente com e-mail; se não houver, o e-mail do cadastro do cliente.
export async function clientRecipients(clientId?: number | null): Promise<string[]> {
    if (!clientId) return []

    const contacts = await Contact.findAll({ where: { ClientId: clientId, email: { [Op.ne]: null as any } } })
    const emails = contacts.flatMap((c) => parseEmails(c.email))

    if (emails.length === 0) emails.push(...parseEmails((await Client.findByPk(clientId))?.email))

    return [...new Set(emails.map((e) => e.toLowerCase()))]
}

export async function alreadySent(kind: string, refType: string, refId: number, stage?: string | null) {
    return !!(await EmailLog.findOne({
        where: { kind, ref_type: refType, ref_id: refId, status: 'enviado', ...(stage ? { stage } : {}) },
    }))
}

type SendOptions = {
    kind: string
    refType: string
    refId: number
    stage?: string | null
    to: string[]
    subject: string
    html: string
    // Evita reenvio do mesmo (kind, ref, stage) já enviado com sucesso.
    dedupe?: boolean
}

export type SendResult = 'enviado' | 'falhou' | 'ignorado' | 'duplicado'

// Envia (Resend, SMTP como reserva cobertos por sendAlertEmail) com cópia interna e registra o resultado.
// Nunca lança: e-mail automático não pode derrubar o fluxo que o disparou.
export async function sendClientEmail(opts: SendOptions): Promise<SendResult> {
    const base = { kind: opts.kind, ref_type: opts.refType, ref_id: opts.refId, stage: opts.stage || null, subject: opts.subject.slice(0, 255) }

    try {
        if (opts.dedupe && (await alreadySent(opts.kind, opts.refType, opts.refId, opts.stage))) return 'duplicado'

        if (opts.to.length === 0) {
            await EmailLog.create({ ...base, to: '-', status: 'ignorado', error: 'Cliente sem e-mail cadastrado' })
            return 'ignorado'
        }

        const channel = await sendAlertEmail({
            to: opts.to,
            cc: parseEmails(process.env.EMAIL_CC),
            subject: opts.subject,
            html: opts.html,
        })

        await EmailLog.create({ ...base, to: opts.to.join(', ').slice(0, 512), status: 'enviado', channel })
        return 'enviado'
    } catch (err) {
        console.error(`[email] falha ao enviar ${opts.kind} ${opts.refType}#${opts.refId}`, err)
        try {
            await EmailLog.create({ ...base, to: opts.to.join(', ').slice(0, 512) || '-', status: 'falhou', error: String((err as Error).message).slice(0, 1000) })
        } catch {}
        return 'falhou'
    }
}
