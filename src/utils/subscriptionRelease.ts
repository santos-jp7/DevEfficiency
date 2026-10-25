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
export function nextDueDate(
    from: Date | string,
    chargeType: 'Mensal' | 'Anual',
    dueDay?: number | null,
): Date {
    const unit = chargeType === 'Anual' ? 'year' : 'month'
    const next = moment(from).add(1, unit)

    if (dueDay) next.date(Math.min(dueDay, next.daysInMonth()))

    // Assinatura muito atrasada: não gera vencimento no passado.
    while (next.isBefore(moment(), 'day')) {
        next.add(1, unit)
        if (dueDay) next.date(Math.min(dueDay, next.daysInMonth()))
    }

    return next.toDate()
}
