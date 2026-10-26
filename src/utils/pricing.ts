import Client from '../models/Client'
import Config from '../models/Config'
import Protocol from '../models/Protocol'
import Service_order from '../models/Service_order'
import Subscription from '../models/Subscription'

export const DEFAULT_HOURLY_RATE = 120

// Arredonda em 2 casas com ROUND_HALF_UP (valores positivos). O epsilon evita 1.005 -> 1.00.
export function round2(value: number): number {
    const n = Number(value) || 0
    const sign = n < 0 ? -1 : 1
    return (sign * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100
}

export async function getHourlyRate(): Promise<number> {
    const config = await Config.findOne({ where: { type: 'hourly_rate' } })
    const rate = Number(config?.value)

    return rate > 0 ? rate : DEFAULT_HOURLY_RATE
}

export async function getClientByProtocol(protocol: Protocol): Promise<Client | null> {
    if (protocol.ServiceOrderId) {
        const service_order = await Service_order.findByPk(protocol.ServiceOrderId)
        return service_order ? Client.findByPk(service_order.ClientId) : null
    }

    if (protocol.SubscriptionId) {
        const subscription = await Subscription.findByPk(protocol.SubscriptionId)
        return subscription ? Client.findByPk(subscription.ClientId) : null
    }

    // Lançamento avulso: o cliente fica direto no protocolo.
    if (protocol.ClientId) return Client.findByPk(protocol.ClientId)

    return null
}

// Percentual de desconto vigente do cliente (0 se não for parceiro).
export function partnerPercentOf(client?: Pick<Client, 'is_partner' | 'partner_discount_percent'> | null): number {
    if (!client?.is_partner) return 0
    return Number(client.partner_discount_percent) || 0
}

export type ServicePricing = {
    estimated_hours: number
    hourly_rate: number
    gross_value: number
    partner_discount_percent: number | null
    partner_discount_value: number
    value: number
}

// valor = horas × valor hora; desconto parceiro incide só sobre o bruto do serviço.
export function computeServicePricing(hours: number, hourlyRate: number, partnerPercent: number): ServicePricing {
    const estimated_hours = round2(hours)
    const hourly_rate = round2(hourlyRate)
    const gross_value = round2(estimated_hours * hourly_rate)
    const partner_discount_value = round2((gross_value * partnerPercent) / 100)

    return {
        estimated_hours,
        hourly_rate,
        gross_value,
        partner_discount_percent: partnerPercent > 0 ? partnerPercent : null,
        partner_discount_value,
        value: round2(gross_value - partner_discount_value),
    }
}

type RegisterLike = { value: number | string; partner_discount_value?: number | string | null }
type ProductLike = { value: number | string }

export type PricingSummary = {
    is_partner: boolean
    partner_discount_percent: number | null
    total_gross: number
    total_partner_discount: number
    total_commercial_discount: number
    total_net: number
}

// total_gross = subtotal sem desconto de parceiro; invariável: gross - parceiro - comercial = net.
// Itens antigos (sem snapshot) entram com value e desconto de parceiro 0.
export function summarizePricing(
    registers: RegisterLike[],
    products: ProductLike[],
    discountValue: number | string | null | undefined,
    client?: Pick<Client, 'is_partner' | 'partner_discount_percent'> | null,
): PricingSummary {
    const registersNet = registers.reduce((sum, r) => sum + Number(r.value || 0), 0)
    const partnerDiscount = registers.reduce((sum, r) => sum + Number(r.partner_discount_value || 0), 0)
    const productsTotal = products.reduce((sum, p) => sum + Number(p.value || 0), 0)
    const commercial = Number(discountValue) || 0

    const total_gross = round2(registersNet + partnerDiscount + productsTotal)
    const total_partner_discount = round2(partnerDiscount)
    const total_commercial_discount = round2(commercial)

    return {
        is_partner: !!client?.is_partner,
        partner_discount_percent: client?.is_partner ? partnerPercentOf(client) : null,
        total_gross,
        total_partner_discount,
        total_commercial_discount,
        total_net: round2(total_gross - total_partner_discount - total_commercial_discount),
    }
}

export function summarizeProtocol(protocol: any, client?: any): PricingSummary {
    return summarizePricing(
        protocol?.Protocol_registers || [],
        protocol?.Protocol_products || [],
        protocol?.discount_value,
        client,
    )
}

// Soma de vários protocolos (cobrança, lista de protocolos, OS com mais de um protocolo).
export function sumSummaries(summaries: PricingSummary[], client?: any): PricingSummary {
    const sum = (key: keyof PricingSummary) => round2(summaries.reduce((s, v) => s + Number(v[key] || 0), 0))

    return {
        is_partner: !!client?.is_partner,
        partner_discount_percent: client?.is_partner ? partnerPercentOf(client) : null,
        total_gross: sum('total_gross'),
        total_partner_discount: sum('total_partner_discount'),
        total_commercial_discount: sum('total_commercial_discount'),
        total_net: sum('total_net'),
    }
}

export function withPricing<T extends { toJSON(): any }>(protocol: T, client?: any) {
    return { ...protocol.toJSON(), pricing: summarizeProtocol(protocol, client) }
}

// Helpers de exibição compartilhados por e-mail, PDFs e orçamentos.
const brl = (v: number | string | null | undefined) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

const percent = (v: number | string | null | undefined) =>
    `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(v) || 0)}%`

export const pricingView = {
    brl,
    percent,
    hours: (v: number | string) =>
        new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(Number(v) || 0),

    // "2,0 h × R$ 120,00 = R$ 240,00 · Desconto parceiro 25%: – R$ 60,00"; '' para itens sem horas (legado/Despesa).
    registerDetail(register: any): string {
        if (register?.type !== 'Serviço' || register.estimated_hours == null) return ''

        const base = `${pricingView.hours(register.estimated_hours)} h × ${brl(register.hourly_rate)} = ${brl(register.gross_value)}`
        const discount = Number(register.partner_discount_value) || 0

        return discount > 0
            ? `${base} · Desconto parceiro ${percent(register.partner_discount_percent)}: – ${brl(discount)}`
            : base
    },

    // "Estimativa: 4 h × R$ 120,00 = R$ 480,00 · Desconto parceiro 25%: – R$ 120,00 · Total: R$ 360,00" (só itens por hora).
    estimate(registers: any[]): string {
        const items = (registers || []).filter((r) => r.type === 'Serviço' && r.estimated_hours != null)
        if (items.length === 0) return ''

        const hours = items.reduce((s, r) => s + Number(r.estimated_hours), 0)
        const gross = items.reduce((s, r) => s + Number(r.gross_value), 0)
        const discount = items.reduce((s, r) => s + Number(r.partner_discount_value || 0), 0)
        const net = items.reduce((s, r) => s + Number(r.value), 0)
        const rates = new Set(items.map((r) => Number(r.hourly_rate)))
        const percentValue = items.find((r) => Number(r.partner_discount_value) > 0)?.partner_discount_percent

        const base =
            rates.size === 1
                ? `${pricingView.hours(hours)} h × ${brl([...rates][0])} = ${brl(gross)}`
                : `${pricingView.hours(hours)} h = ${brl(gross)}`

        return `Estimativa: ${base}${discount > 0 ? ` · Desconto parceiro ${percent(percentValue)}: – ${brl(discount)}` : ''} · Total: ${brl(net)}`
    },

    partnerSeal(client: any): string {
        return client?.is_partner
            ? `Cliente parceiro Codlinx · ${percent(client.partner_discount_percent)} de desconto em serviços`
            : ''
    },

    // Frase do e-mail de cobrança.
    partnerSentence(summary: PricingSummary): string {
        return summary.total_partner_discount > 0
            ? `Como cliente parceiro, esta cobrança inclui <strong>${brl(summary.total_partner_discount)} de desconto</strong> (${percent(summary.partner_discount_percent)} sobre os serviços).`
            : ''
    },
}
