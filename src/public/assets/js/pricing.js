// Cálculo de itens de serviço por hora (espelha utils/pricing.ts). O servidor sempre recalcula ao gravar.
window.Pricing = {
    round2(value) {
        const n = Number(value) || 0
        const sign = n < 0 ? -1 : 1
        return (sign * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100
    },
    brl(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)
    },
    percent(value) {
        return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value) || 0) + '%'
    },
    hours(value) {
        return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(
            Number(value) || 0,
        )
    },
    calc(hours, hourlyRate, partnerPercent) {
        const h = this.round2(hours)
        const rate = this.round2(hourlyRate)
        const gross = this.round2(h * rate)
        const discount = this.round2((gross * (Number(partnerPercent) || 0)) / 100)
        return { hours: h, rate, gross, discount, net: this.round2(gross - discount) }
    },
}
