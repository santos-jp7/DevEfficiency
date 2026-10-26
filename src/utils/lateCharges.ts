import moment from 'moment'

import { getConfigValue } from './clientMail'
import { round2 } from './statementParser'
import { nowInBusinessTimezone } from './payablesAlert'

// Encargos por atraso — INFORMATIVOS (acompanhamento): não alteram o valor da cobrança.
//   multa  = % fixo sobre o valor do débito (padrão 2%), cobrada uma vez quando há atraso;
//   juros  = % ao mês (padrão 1%), calculado pro rata por dia (1%/30 por dia) sobre o valor do débito.
export type LateRules = { feePercent: number; interestMonthPercent: number }

export const DEFAULT_LATE_RULES: LateRules = { feePercent: 2, interestMonthPercent: 1 }

export type LateCharges = {
    overdue: boolean
    days: number
    principal: number
    fee: number
    interest: number
    charges: number // multa + juros
    total_with_charges: number
}

export async function getLateRules(): Promise<LateRules> {
    const num = (v: string, fallback: number) => {
        const n = Number(String(v).replace(',', '.'))
        return Number.isFinite(n) && n >= 0 ? n : fallback
    }

    return {
        feePercent: num(await getConfigValue('late_fee_percent', String(DEFAULT_LATE_RULES.feePercent)), DEFAULT_LATE_RULES.feePercent),
        interestMonthPercent: num(
            await getConfigValue('late_interest_percent_month', String(DEFAULT_LATE_RULES.interestMonthPercent)),
            DEFAULT_LATE_RULES.interestMonthPercent,
        ),
    }
}

// `dueDate` = data de vencimento (AAAA-MM-DD ou Date em UTC); `today` = dia do cálculo (padrão: hoje no fuso do negócio).
export function computeLateCharges(principal: number, dueDate: string | Date | null | undefined, rules: LateRules, today = nowInBusinessTimezone().date): LateCharges {
    const value = round2(Number(principal) || 0)
    const days = dueDate ? moment(today).diff(moment.utc(dueDate as any).format('YYYY-MM-DD'), 'days') : 0

    if (days <= 0) return { overdue: false, days: 0, principal: value, fee: 0, interest: 0, charges: 0, total_with_charges: value }

    const fee = round2((value * rules.feePercent) / 100)
    const interest = round2(((value * rules.interestMonthPercent) / 100 / 30) * days)

    return { overdue: true, days, principal: value, fee, interest, charges: round2(fee + interest), total_with_charges: round2(value + fee + interest) }
}
