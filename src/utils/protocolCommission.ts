import { round2, summarizePricing } from './pricing'

// Protocolos por comissão: o fornecedor (ex.: Microsoft, Bitdefender) cobra o cliente pelo valor cheio e eu recebo
// do fornecedor só a comissão. A comissão é sugerida por % sobre o total líquido do protocolo ou informada na mão
// (contas mais complexas, como imposto do fornecedor) — nesse caso `commission_manual` trava o valor.

type ProtocolLike = {
    billing_mode?: string | null
    discount_value?: number | string | null
    commission_percent?: number | string | null
    commission_value?: number | string | null
    commission_manual?: boolean | null
}
type RegisterLike = { value: number | string; partner_discount_value?: number | string | null }
type ProductLike = { value: number | string }

export const isCommission = (protocol?: ProtocolLike | null) => protocol?.billing_mode === 'Comissão'

// Total líquido que o cliente paga (ao fornecedor, no modo comissão).
export function protocolNetTotal(protocol: ProtocolLike, registers: RegisterLike[], products: ProductLike[]): number {
    return summarizePricing(registers || [], products || [], protocol?.discount_value).total_net
}

export function suggestedCommission(protocol: ProtocolLike, registers: RegisterLike[], products: ProductLike[]): number {
    const percent = Number(protocol?.commission_percent) || 0
    return round2((protocolNetTotal(protocol, registers, products) * percent) / 100)
}

export function expectedCommission(protocol: ProtocolLike, registers: RegisterLike[], products: ProductLike[]): number {
    if (protocol?.commission_manual) return round2(Number(protocol.commission_value) || 0)
    return suggestedCommission(protocol, registers, products)
}

// Quanto o protocolo precisa receber para ser fechado: total líquido (direto) ou a comissão (comissão).
export function amountDue(protocol: ProtocolLike, registers: RegisterLike[], products: ProductLike[]): number {
    return isCommission(protocol)
        ? expectedCommission(protocol, registers, products)
        : protocolNetTotal(protocol, registers, products)
}

export type CommissionSummary = {
    mode: 'Direto' | 'Comissão'
    supplier: { id: number; name: string } | null
    client_total: number
    percent: number | null
    suggested: number
    value: number
    manual: boolean
    received: number
    pending: number
}

// Resumo para API/telas. Espera o protocolo com Protocol_registers, Protocol_products, Receipts e CommissionSupplier.
export function summarizeCommission(protocol: any): CommissionSummary | null {
    if (!isCommission(protocol)) return null

    const registers = protocol?.Protocol_registers || []
    const products = protocol?.Protocol_products || []
    const received = round2((protocol?.Receipts || []).reduce((s: number, r: any) => s + (Number(r.value) || 0), 0))
    const value = expectedCommission(protocol, registers, products)
    const supplier = protocol?.CommissionSupplier

    return {
        mode: 'Comissão',
        supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
        client_total: protocolNetTotal(protocol, registers, products),
        percent: protocol?.commission_percent ?? null,
        suggested: suggestedCommission(protocol, registers, products),
        value,
        manual: !!protocol?.commission_manual,
        received,
        pending: round2(Math.max(value - received, 0)),
    }
}
