import { Op } from 'sequelize'

import CrmActivity from '../models/CrmActivity'
import Lead from '../models/Lead'
import Opportunity from '../models/Opportunity'
import Client from '../models/Client'
import { parseEmails, sendResendEmail } from './resendMail'
import { DEFAULT_ALERT_EMAIL, getConfig, nowInBusinessTimezone, setConfig } from './payablesAlert'
import { esc } from './emailTemplates'

const TIMEZONE = 'America/Sao_Paulo'

// Dia (YYYY-MM-DD) e hora (HH:mm) no fuso do negócio.
const dayOf = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE }).format(d)
const timeOf = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(d)
const br = (iso: string) => iso.split('-').reverse().join('/')

export type FollowupAlertResult = { sent: boolean; reason?: string; count?: number; to?: string[] }

// Para quem é a atividade: oportunidade (com lead/cliente) ou só lead/cliente.
function whoOf(a: any): string {
    const party = a.Client?.name || (a.Lead ? (a.Lead.company ? `${a.Lead.company} (${a.Lead.name})` : a.Lead.name) : '')
    return [a.Opportunity?.title, party].filter(Boolean).join(' · ') || '-'
}

// Pendências do CRM: follow-ups atrasados e do dia, uma vez por dia a partir de CRM_FOLLOWUPS_HOUR (padrão 8h).
export async function sendCrmFollowupsAlert(options: { force?: boolean } = {}): Promise<FollowupAlertResult> {
    const { date: today, hour } = nowInBusinessTimezone()

    if ((await getConfig('crm_followups_enabled')) === 'false') return { sent: false, reason: 'Aviso desativado nas configurações.' }

    if (!options.force) {
        const sendHour = Number(process.env.CRM_FOLLOWUPS_HOUR ?? 8)
        if (hour < sendHour) return { sent: false, reason: 'Fora do horário de envio.' }
        if ((await getConfig('crm_followups_last_sent')) === today) return { sent: false, reason: 'Já enviado hoje.' }
    }

    const recipients = parseEmails(
        (await getConfig('crm_followups_email')) || (await getConfig('payables_alert_email')) || DEFAULT_ALERT_EMAIL,
    )
    if (recipients.length === 0) return { sent: false, reason: 'Nenhum e-mail configurado.' }

    // Até o fim do dia de hoje no fuso do negócio; oportunidades ganhas/perdidas não contam.
    const endOfToday = new Date(`${today}T23:59:59-03:00`)
    const activities = await CrmActivity.findAll({
        where: {
            done_at: null,
            due_at: { [Op.ne]: null, [Op.lte]: endOfToday },
            [Op.or]: [{ OpportunityId: null }, { '$Opportunity.stage$': { [Op.notIn]: ['Ganho', 'Perdido'] } }],
        } as any,
        include: [
            { model: Opportunity, attributes: ['id', 'title', 'stage'] },
            { model: Lead, attributes: ['id', 'name', 'company'] },
            { model: Client, attributes: ['id', 'name'] },
        ],
        order: [['due_at', 'ASC']],
    })

    if (activities.length === 0) {
        if (!options.force) await setConfig('crm_followups_last_sent', today)
        return { sent: false, reason: 'Nenhum follow-up atrasado ou para hoje.', count: 0 }
    }

    const groups = [
        { title: 'Atrasados', color: '#c0392b', items: activities.filter((a) => dayOf(a.due_at as Date) < today) },
        { title: 'Hoje', color: '#2471a3', items: activities.filter((a) => dayOf(a.due_at as Date) === today) },
    ].filter((g) => g.items.length > 0)

    const section = (g: (typeof groups)[number]) => `
        <h3 style="color:${g.color};margin:24px 0 8px">${g.title} (${g.items.length})</h3>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
            <tr style="background:#f4f4f4;text-align:left">
                <th style="padding:6px 8px">Quando</th><th style="padding:6px 8px">Atividade</th><th style="padding:6px 8px">Oportunidade / contato</th>
            </tr>
            ${g.items
                .map((a) => {
                    const due = a.due_at as Date
                    const when = g.title === 'Hoje' ? timeOf(due) : `${br(dayOf(due))} ${timeOf(due)}`
                    return `<tr style="border-bottom:1px solid #eee">
                <td style="padding:6px 8px;white-space:nowrap">${when}</td>
                <td style="padding:6px 8px">${esc(a.type)} &mdash; ${esc(a.subject)}</td>
                <td style="padding:6px 8px">${esc(whoOf(a))}</td></tr>`
                })
                .join('')}
        </table>`

    const overdue = groups.find((g) => g.title === 'Atrasados')
    const html = `
        <div style="font-family:Arial,sans-serif;color:#222;max-width:680px">
            <h2 style="margin-bottom:4px">Follow-ups do CRM &mdash; ${br(today)}</h2>
            <p style="margin-top:0;color:#555">${activities.length} pendência(s) para hoje ou atrasada(s).</p>
            ${groups.map(section).join('')}
        </div>`

    const subject = `[CRM] ${overdue ? `${overdue.items.length} follow-up(s) atrasado(s) · ` : ''}${activities.length} pendência(s) até hoje`

    await sendResendEmail({ to: recipients, subject, html })

    // Envio manual não consome o aviso diário.
    if (!options.force) await setConfig('crm_followups_last_sent', today)

    return { sent: true, count: activities.length, to: recipients }
}
