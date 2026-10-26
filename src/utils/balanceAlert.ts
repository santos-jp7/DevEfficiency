import Config from '../models/Config'
import { checkAllAccounts } from './balanceCheck'
import { brl, esc } from './emailTemplates'
import { getConfigValue, isEnabled } from './clientMail'
import { parseEmails, sendResendEmail } from './resendMail'
import { DEFAULT_ALERT_EMAIL } from './payablesAlert'

export type BalanceAlertResult = { sent: boolean; reason?: string; divergent?: number; pending_setup?: number }

async function setConfig(type: string, value: string) {
    const [config, created] = await Config.findOrCreate({ where: { type }, defaults: { type, value, upload: false } })
    if (!created) await config.update({ value })
}

// Avisa por e-mail quando algum saldo diverge das movimentações (ou há conta sem saldo inicial confirmado).
// Só reenvia quando a situação muda — não repete o mesmo aviso todo dia.
export async function runBalanceAlert(options: { force?: boolean } = {}): Promise<BalanceAlertResult> {
    if (!(await isEnabled('balance_alert_enabled'))) return { sent: false, reason: 'Aviso desativado nas configurações.' }

    const checks = await checkAllAccounts()
    const divergent = checks.filter((c) => c.status === 'divergente')
    const pending = checks.filter((c) => c.status === 'sem_saldo_inicial')

    const signature = JSON.stringify([divergent.map((c) => [c.id, c.difference]), pending.map((c) => c.id)])
    const last = (await Config.findOne({ where: { type: 'balance_alert_last' } }))?.value || ''

    if (divergent.length === 0 && pending.length === 0) {
        if (last) await setConfig('balance_alert_last', '')
        return { sent: false, reason: 'Todos os saldos conferem.', divergent: 0, pending_setup: 0 }
    }

    if (!options.force && last === signature) return { sent: false, reason: 'Situação já avisada.', divergent: divergent.length, pending_setup: pending.length }

    const to = parseEmails(await getConfigValue('balance_alert_email', await getConfigValue('payables_alert_email', DEFAULT_ALERT_EMAIL)))
    if (to.length === 0) return { sent: false, reason: 'Nenhum e-mail configurado.' }

    const rows = (list: typeof checks, withDiff: boolean) =>
        list
            .map(
                (c) => `<tr style="border-bottom:1px solid #eee"><td style="padding:6px 8px">${esc(c.name)}</td>
                <td style="padding:6px 8px;text-align:right">${brl(c.balance)}</td>
                <td style="padding:6px 8px;text-align:right">${withDiff ? brl(c.expected as number) : '—'}</td>
                <td style="padding:6px 8px;text-align:right;color:#c0392b"><strong>${withDiff ? brl(c.difference as number) : '—'}</strong></td></tr>`,
            )
            .join('')

    const table = (title: string, list: typeof checks, withDiff: boolean) =>
        list.length === 0
            ? ''
            : `<h3 style="margin:20px 0 8px">${title}</h3>
        <table style="border-collapse:collapse;width:100%;font-size:14px"><tr style="background:#f4f4f4;text-align:left">
        <th style="padding:6px 8px">Conta</th><th style="padding:6px 8px;text-align:right">Saldo gravado</th><th style="padding:6px 8px;text-align:right">Esperado</th><th style="padding:6px 8px;text-align:right">Diferença</th></tr>${rows(list, withDiff)}</table>`

    const html = `<div style="font-family:Arial,sans-serif;color:#222;max-width:680px">
        <h2>Conferência de saldo</h2>
        <p>O saldo gravado difere do que as movimentações indicam (recebimentos, contas pagas, ressarcimentos e transferências).
        Abra <strong>Contas Bancárias</strong> para ver o extrato da conta e corrigir.</p>
        ${table('Saldos divergentes', divergent, true)}
        ${pending.length ? `<p style="margin-top:20px">Contas sem saldo inicial confirmado (a conferência só começa depois de confirmar): ${pending.map((c) => esc(c.name)).join(', ')}.</p>` : ''}
    </div>`

    await sendResendEmail({
        to,
        subject: `[Saldo] ${divergent.length ? `${divergent.length} conta(s) com saldo divergente` : `${pending.length} conta(s) sem saldo inicial`}`,
        html,
    })

    await setConfig('balance_alert_last', signature)

    return { sent: true, divergent: divergent.length, pending_setup: pending.length }
}
