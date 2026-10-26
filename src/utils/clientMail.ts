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

export type EmailMode = 'off' | 'test' | 'live'

// Trava central dos e-mails automáticos ao cliente (lembretes, etapas da OS, chamados):
//   off  = não envia nada (padrão);  test = envia só para o destinatário de teste, com o aviso de quem seria;
//   live = envia de verdade.
export async function getEmailMode(): Promise<EmailMode> {
    const mode = (await getConfigValue('auto_email_mode', 'off')).toLowerCase()
    return mode === 'live' || mode === 'test' ? mode : 'off'
}

export async function testRecipients(): Promise<string[]> {
    const raw = await getConfigValue('auto_email_test_to', await getConfigValue('payables_alert_email', 'jean.pierre@codlinx.com.br'))
    return parseEmails(raw)
}

export async function alreadySent(kind: string, refType: string, refId: number, stage?: string | null, status: 'enviado' | 'teste' = 'enviado') {
    return !!(await EmailLog.findOne({
        where: { kind, ref_type: refType, ref_id: refId, status, ...(stage ? { stage } : {}) },
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
    // Ação deliberada de uma pessoa (botão "Enviar lembrete", resposta da equipe no chamado): ignora a trava.
    manual?: boolean
}

export type SendResult = 'enviado' | 'falhou' | 'ignorado' | 'duplicado' | 'desligado' | 'teste'

// Envia (Resend, SMTP como reserva cobertos por sendAlertEmail) com cópia interna e registra o resultado.
// Nunca lança: e-mail automático não pode derrubar o fluxo que o disparou.
export async function sendClientEmail(opts: SendOptions): Promise<SendResult> {
    const base = { kind: opts.kind, ref_type: opts.refType, ref_id: opts.refId, stage: opts.stage || null, subject: opts.subject.slice(0, 255) }
    const original = opts.to.join(', ')

    try {
        const mode: EmailMode = opts.manual ? 'live' : await getEmailMode()

        if (mode === 'off') {
            await EmailLog.create({ ...base, to: original.slice(0, 512) || '-', status: 'ignorado', error: 'Envio automático desligado (auto_email_mode=off)' })
            return 'desligado'
        }

        // Em teste, a trava de duplicidade usa os registros de teste; assim o envio real depois não é bloqueado.
        const logStatus = mode === 'test' ? 'teste' : 'enviado'
        if (opts.dedupe && (await alreadySent(opts.kind, opts.refType, opts.refId, opts.stage, logStatus))) return 'duplicado'

        if (opts.to.length === 0) {
            await EmailLog.create({ ...base, to: '-', status: 'ignorado', error: 'Cliente sem e-mail cadastrado' })
            return 'ignorado'
        }

        if (mode === 'test') {
            const to = await testRecipients()
            if (to.length === 0) {
                await EmailLog.create({ ...base, to: '-', status: 'ignorado', error: 'Modo teste sem destinatário (auto_email_test_to)' })
                return 'ignorado'
            }

            const banner = `<div style="background:#fff3cd;border:1px solid #ffc107;padding:10px;font-family:Arial,sans-serif;font-size:13px;color:#664d03">
                <strong>MODO TESTE</strong> &mdash; este e-mail seria enviado para: ${original.replace(/</g, '&lt;')}</div>`

            const channel = await sendAlertEmail({ to, subject: `[TESTE] ${opts.subject}`, html: banner + opts.html })
            await EmailLog.create({ ...base, to: to.join(', ').slice(0, 512), status: 'teste', channel, error: `Destinatário original: ${original}`.slice(0, 1000) })
            return 'teste'
        }

        const channel = await sendAlertEmail({ to: opts.to, cc: parseEmails(process.env.EMAIL_CC), subject: opts.subject, html: opts.html })

        await EmailLog.create({ ...base, to: original.slice(0, 512), status: 'enviado', channel })
        return 'enviado'
    } catch (err) {
        console.error(`[email] falha ao enviar ${opts.kind} ${opts.refType}#${opts.refId}`, err)
        try {
            await EmailLog.create({ ...base, to: original.slice(0, 512) || '-', status: 'falhou', error: String((err as Error).message).slice(0, 1000) })
        } catch {}
        return 'falhou'
    }
}
