import moment from 'moment'

import Config from '../models/Config'

// Quantos dias antes do vencimento o protocolo da assinatura vira "Liberado para pagamento" (gera a cobrança).
// Padrão 45: assinaturas mensais são liberadas assim que a renovação é criada (sem marcar manualmente);
// assinaturas anuais esperam chegar 45 dias antes do vencimento. Configurável em Configurações.
export const DEFAULT_RELEASE_DAYS = 45

export async function getReleaseDays(): Promise<number> {
    const config = await Config.findOne({ where: { type: 'subscription_release_days' } })
    const days = Number(config?.value)

    return Number.isFinite(days) && days >= 0 ? Math.floor(days) : DEFAULT_RELEASE_DAYS
}

export function isWithinReleaseWindow(dueAt: Date | string, releaseDays: number): boolean {
    return moment(dueAt).diff(moment(), 'days') <= releaseDays
}

// Próximo vencimento: soma o período ao vencimento anterior (não à data do pagamento, que deslocava o ciclo
// quando o pagamento atrasava ou adiantava) e fixa o dia de vencimento do cliente, respeitando o fim do mês.
// `skipPast` pula vencimentos que já passaram — só para assinaturas NOVAS. A renovação usa o ciclo seguinte exato
// (skipPast = false): todo mês é cobrado, mesmo que o cliente esteja inadimplente.
export function nextDueDate(
    from: Date | string,
    chargeType: 'Mensal' | 'Anual',
    dueDay?: number | null,
    skipPast = true,
): Date {
    const unit = chargeType === 'Anual' ? 'year' : 'month'
    const next = moment(from).add(1, unit)

    if (dueDay) next.date(Math.min(dueDay, next.daysInMonth()))

    while (skipPast && next.isBefore(moment(), 'day')) {
        next.add(1, unit)
        if (dueDay) next.date(Math.min(dueDay, next.daysInMonth()))
    }

    return next.toDate()
}

// A partir desta data, todo ciclo da assinatura é cobrado, mesmo com o cliente inadimplente. Os ciclos anteriores
// (de antes desta regra) não são cobrados retroativamente: o primeiro deploy grava o dia em que passou a valer.
export const CYCLE_START_KEY = 'subscription_cycle_start_date'

export async function getCycleStartDate(): Promise<moment.Moment> {
    const config = await Config.findOne({ where: { type: CYCLE_START_KEY } })
    const date = moment(config?.value, 'YYYY-MM-DD', true)
    return date.isValid() ? date.startOf('day') : moment('1970-01-01')
}

// Próximo ciclo a cobrar: o seguinte exato, sem pular meses; só os anteriores à data de início ficam de fora.
export function nextBillableDueDate(
    from: Date | string,
    chargeType: 'Mensal' | 'Anual',
    dueDay: number | null | undefined,
    start: moment.Moment,
): Date {
    let next = nextDueDate(from, chargeType, dueDay, false)
    while (moment(next).isBefore(start, 'day')) next = nextDueDate(next, chargeType, dueDay, false)
    return next
}
