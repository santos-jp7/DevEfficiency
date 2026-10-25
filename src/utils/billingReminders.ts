import moment from 'moment'

import Billing from '../models/Billing'
import BillingFile from '../models/BillingFile'
import Client from '../models/Client'
import { brl, emailLayout, esc, infoBox } from './emailTemplates'
import { clientRecipients, getConfigValue, isEnabled, sendClientEmail, SendResult } from './clientMail'
import { nowInBusinessTimezone } from './payablesAlert'

// Dias em relação ao vencimento: negativo = antes, 0 = no dia, positivo = atraso.
export const DEFAULT_SCHEDULE = '-3,0,1,7,15'

export function parseSchedule(text: string): number[] {
    const offsets = text
        .split(/[,;\s]+/)
        .filter((v) => v !== '')
        .map(Number)
        .filter((n) => Number.isInteger(n))

    return [...new Set(offsets)].sort((a, b) => a - b)
}

// Etapa vigente: o maior marco já alcançado. Se o sistema ficou fora do ar num marco, o próximo envio
// cobre o último marco alcançado (sem disparar vários e-mails atrasados de uma vez).
export function currentStage(diffDays: number, schedule: number[]): number | null {
    const reached = schedule.filter((offset) => offset <= diffDays)
    return reached.length ? reached[reached.length - 1] : null
}

const stageKey = (offset: number) => `d${offset}`

function dayText(n: number) {
    return `${n} dia${n === 1 ? '' : 's'}`
}

export async function sendBillingReminder(billingId: number, offset: number | 'manual', diffDays: number): Promise<SendResult> {
    const billing = await Billing.findByPk(billingId, { include: [Client, BillingFile] })
    if (!billing) return 'ignorado'

    const client = (billing as any).Client as Client | null
    const files: any[] = (billing as any).BillingFiles || []
    const latest = (type: string) => files.filter((f) => f.type === type).sort((a, b) => b.id - a.id)[0]
    const boleto = latest('boleto')
    const nota = latest('nota_fiscal')

    const due = moment.utc(billing.due_date as any).format('DD/MM/YYYY')
    const overdue = diffDays > 0

    let title: string
    let subjectPrefix: string
    let intro: string

    if (diffDays < 0) {
        title = 'Lembrete de vencimento'
        subjectPrefix = `Fatura vence em ${dayText(-diffDays)}`
        intro = `Sua fatura vence em ${dayText(-diffDays)}, no dia ${due}.`
    } else if (diffDays === 0) {
        title = 'Sua fatura vence hoje'
        subjectPrefix = 'Fatura vence hoje'
        intro = `Sua fatura vence hoje (${due}).`
    } else {
        title = 'Fatura em atraso'
        subjectPrefix = `Fatura em atraso há ${dayText(diffDays)}`
        intro = `Sua fatura venceu em ${due} e consta em aberto há ${dayText(diffDays)}.`
    }

    const links = [boleto && ['Boleto', boleto.url], nota && ['Nota fiscal', nota.url]].filter(Boolean) as string[][]

    const body = `
        <p>${esc(intro)}</p>
        ${infoBox([
            ['Valor', brl(Number(billing.total_value))],
            ['Vencimento', due],
        ])}
        ${links.length ? `<p>${links.map(([label, url]) => `<a href="${esc(url)}">${esc(label)}</a>`).join(' &nbsp;|&nbsp; ')}</p>` : ''}
        <p style="font-size:14px;color:#666">${
            overdue
                ? 'Caso o pagamento já tenha sido realizado, por favor desconsidere esta mensagem ou nos envie o comprovante respondendo este e-mail.'
                : 'Se o pagamento já foi realizado, desconsidere este lembrete.'
        }</p>`

    const name = client?.corporate_name || client?.name || ''

    const html = emailLayout({
        title,
        greeting: `Prezado(a) ${name},`,
        body,
        accent: overdue ? '#c0392b' : '#0056b3',
    })

    return sendClientEmail({
        kind: 'billing_reminder',
        refType: 'billing',
        refId: billing.id,
        stage: offset === 'manual' ? null : stageKey(offset),
        to: await clientRecipients(billing.ClientId),
        subject: `${subjectPrefix} — ${name}`,
        html,
        dedupe: offset !== 'manual',
    })
}

export type ReminderRun = { checked: number; sent: number; skipped?: string }

// Percorre as cobranças faturadas (fatura já emitida ao cliente) e envia o lembrete da etapa vigente.
export async function runBillingReminders(options: { force?: boolean } = {}): Promise<ReminderRun> {
    if (!(await isEnabled('billing_reminders_enabled'))) return { checked: 0, sent: 0, skipped: 'desativado' }

    const { date: today, hour } = nowInBusinessTimezone()
    const sendHour = Number(process.env.BILLING_REMINDER_HOUR ?? 9)
    if (!options.force && hour < sendHour) return { checked: 0, sent: 0, skipped: 'fora do horário' }

    const schedule = parseSchedule(await getConfigValue('billing_reminder_schedule', DEFAULT_SCHEDULE))
    if (schedule.length === 0) return { checked: 0, sent: 0, skipped: 'sem etapas' }

    const billings = await Billing.findAll({ where: { status: 'faturada' } })

    let sent = 0
    for (const billing of billings) {
        if (!billing.due_date) continue

        const diff = moment(today).diff(moment.utc(billing.due_date as any).format('YYYY-MM-DD'), 'days')
        const offset = currentStage(diff, schedule)
        if (offset === null) continue

        if ((await sendBillingReminder(billing.id, offset, diff)) === 'enviado') sent++
    }

    return { checked: billings.length, sent }
}
