import { Resend } from 'resend'

import sendMail from './sendEmail'

let client: Resend | null = null

function getClient(): Resend | null {
    if (!process.env.RESEND_API_KEY) return null
    if (!client) client = new Resend(process.env.RESEND_API_KEY)
    return client
}

const splitEmails = (value?: string | string[] | null): string[] =>
    (Array.isArray(value) ? value : String(value || '').split(/[,;\s]+/)).map((v) => v.trim()).filter(Boolean)

export const parseEmails = splitEmails

type Message = {
    to: string | string[]
    subject: string
    html: string
    cc?: string | string[]
}

// Envia pelo Resend. O Resend devolve { error } em vez de lançar, então convertemos em exceção.
export async function sendResendEmail({ to, subject, html, cc }: Message): Promise<void> {
    const resend = getClient()
    if (!resend) throw new Error('RESEND_API_KEY não configurada')

    const recipients = splitEmails(to)
    if (recipients.length === 0) throw new Error('Nenhum destinatário informado')

    const from = process.env.RESEND_ALERT_FROM || process.env.RESEND_FROM || 'fatura@codlinx.com.br'
    const ccList = splitEmails(cc).filter((c) => !recipients.includes(c))

    const { error } = await resend.emails.send({
        from,
        to: recipients,
        ...(ccList.length ? { cc: ccList } : {}),
        subject,
        html,
    })

    if (error) throw new Error(`Resend: ${error.message}`)
}

// Alertas operacionais: Resend primeiro; se não estiver configurado ou falhar, tenta o SMTP antigo para o
// aviso não se perder. Retorna o canal usado.
export async function sendAlertEmail(message: Message): Promise<'resend' | 'smtp'> {
    try {
        await sendResendEmail(message)
        return 'resend'
    } catch (err) {
        console.error('[email] falha no Resend, tentando SMTP:', (err as Error).message)
        sendMail([...splitEmails(message.to)], message.subject, message.html)
        return 'smtp'
    }
}
