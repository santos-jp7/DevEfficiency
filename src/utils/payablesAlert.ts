import { Op } from 'sequelize'

import Config from '../models/Config'
import Payable from '../models/Payable'
import Supplier from '../models/Supplier'
import Seller from '../models/Seller'
import CostCenter from '../models/CostCenter'
import { parseEmails, sendResendEmail } from './resendMail'

export const DEFAULT_ALERT_EMAIL = 'jean.pierre@codlinx.com.br'
const TIMEZONE = 'America/Sao_Paulo'

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const br = (iso: string) => iso.split('-').reverse().join('/')

const escapeHtml = (text: unknown) =>
    String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

async function getConfig(type: string): Promise<string | null> {
    return (await Config.findOne({ where: { type } }))?.value ?? null
}

async function setConfig(type: string, value: string): Promise<void> {
    const [config, created] = await Config.findOrCreate({ where: { type }, defaults: { type, value, upload: false } })
    if (!created) await config.update({ value })
}

// Data/hora no fuso do negócio, independente do fuso do servidor.
export function nowInBusinessTimezone() {
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE }).format(new Date())
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', hour12: false }).format(new Date()))
    return { date, hour: hour % 24 }
}

const addDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

export type AlertResult = { sent: boolean; reason?: string; count?: number; to?: string[] }

export async function sendPayablesAlert(options: { force?: boolean } = {}): Promise<AlertResult> {
    const { date: today, hour } = nowInBusinessTimezone()

    if ((await getConfig('payables_alert_enabled')) === 'false') return { sent: false, reason: 'Aviso desativado nas configurações.' }

    if (!options.force) {
        const sendHour = Number(process.env.PAYABLES_ALERT_HOUR ?? 8)
        if (hour < sendHour) return { sent: false, reason: 'Fora do horário de envio.' }
        if ((await getConfig('payables_alert_last_sent')) === today) return { sent: false, reason: 'Já enviado hoje.' }
    }

    const recipients = parseEmails((await getConfig('payables_alert_email')) || DEFAULT_ALERT_EMAIL)
    if (recipients.length === 0) return { sent: false, reason: 'Nenhum e-mail configurado.' }

    const daysConfig = Number(await getConfig('payables_alert_days'))
    const days = Number.isFinite(daysConfig) && daysConfig >= 0 ? Math.floor(daysConfig) : 3
    const limit = addDays(today, days)

    const payables = await Payable.findAll({
        where: { status: { [Op.in]: ['pendente', 'atrasado'] }, dueDate: { [Op.lte]: limit } },
        include: [Supplier, Seller, CostCenter],
        order: [['dueDate', 'ASC']],
    })

    if (payables.length === 0) {
        if (!options.force) await setConfig('payables_alert_last_sent', today)
        return { sent: false, reason: 'Nenhuma conta vencida ou a vencer.', count: 0 }
    }

    const due = (p: Payable) => String(p.dueDate).slice(0, 10)
    const groups = [
        { title: 'Atrasadas', color: '#c0392b', items: payables.filter((p) => due(p) < today) },
        { title: 'Vencem hoje', color: '#d68910', items: payables.filter((p) => due(p) === today) },
        { title: `Próximos ${days} dia(s)`, color: '#2471a3', items: payables.filter((p) => due(p) > today) },
    ].filter((g) => g.items.length > 0)

    const section = (g: (typeof groups)[number]) => `
        <h3 style="color:${g.color};margin:24px 0 8px">${g.title} (${g.items.length}) &mdash; ${brl(g.items.reduce((s, p) => s + Number(p.value), 0))}</h3>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
            <tr style="background:#f4f4f4;text-align:left">
                <th style="padding:6px 8px">Vencimento</th><th style="padding:6px 8px">Descrição</th>
                <th style="padding:6px 8px">Favorecido</th><th style="padding:6px 8px;text-align:right">Valor</th>
            </tr>
            ${g.items
                .map(
                    (p) => `<tr style="border-bottom:1px solid #eee">
                <td style="padding:6px 8px">${br(due(p))}</td>
                <td style="padding:6px 8px">${escapeHtml(p.description)}</td>
                <td style="padding:6px 8px">${escapeHtml((p as any).Supplier?.name || (p as any).Seller?.name || '-')}</td>
                <td style="padding:6px 8px;text-align:right">${brl(Number(p.value))}</td></tr>`,
                )
                .join('')}
        </table>`

    const total = payables.reduce((s, p) => s + Number(p.value), 0)
    const overdue = groups.find((g) => g.title === 'Atrasadas')

    const html = `
        <div style="font-family:Arial,sans-serif;color:#222;max-width:680px">
            <h2 style="margin-bottom:4px">Contas a pagar &mdash; ${br(today)}</h2>
            <p style="margin-top:0;color:#555">${payables.length} conta(s) pendente(s), total de <strong>${brl(total)}</strong>.</p>
            ${groups.map(section).join('')}
        </div>`

    const subject = `[Contas a pagar] ${overdue ? `${overdue.items.length} atrasada(s) · ` : ''}${payables.length} conta(s) · ${brl(total)}`

    await sendResendEmail({ to: recipients, subject, html })

    // Envio manual não consome o aviso diário.
    if (!options.force) await setConfig('payables_alert_last_sent', today)

    return { sent: true, count: payables.length, to: recipients }
}
