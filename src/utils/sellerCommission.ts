import { round2 } from './pricing'

type SellerRules = {
    commission_percent: number | string
    commission_base: 'liquido' | 'bruto'
    applies_to: 'ambos' | 'servicos' | 'produtos'
    min_protocol_value?: number | string | null
}

type RegisterLike = { type: string; value: number | string; gross_value?: number | string | null }
type ProductLike = { value: number | string }

export type CommissionResult = {
    eligible: boolean
    reason: string | null
    protocol_total: number // total líquido do protocolo (itens - desconto)
    base: number
    percent: number
    commission: number
}

const num = (v: any) => Number(v) || 0

// Base de cálculo conforme as regras do vendedor:
//  - applies_to: serviços, produtos ou ambos (despesas repassadas nunca comissionam);
//  - commission_base "bruto": valores antes dos descontos (parceiro e comercial);
//  - commission_base "liquido": valores após desconto de parceiro e desconto comercial do protocolo (rateado).
export function computeCommission(
    seller: SellerRules,
    registers: RegisterLike[],
    products: ProductLike[],
    discountValue: number | string | null | undefined,
): CommissionResult {
    const percent = num(seller.commission_percent)

    const services = registers.filter((r) => r.type === 'Serviço')
    const allItemsTotal = registers.reduce((s, r) => s + num(r.value), 0) + products.reduce((s, p) => s + num(p.value), 0)
    const discount = Math.min(num(discountValue), allItemsTotal)
    const protocol_total = round2(allItemsTotal - discount)

    const withServices = seller.applies_to !== 'produtos'
    const withProducts = seller.applies_to !== 'servicos'

    let base = 0

    if (seller.commission_base === 'bruto') {
        if (withServices) base += services.reduce((s, r) => s + num(r.gross_value ?? r.value), 0)
        if (withProducts) base += products.reduce((s, p) => s + num(p.value), 0)
    } else {
        let net = 0
        if (withServices) net += services.reduce((s, r) => s + num(r.value), 0)
        if (withProducts) net += products.reduce((s, p) => s + num(p.value), 0)

        const factor = allItemsTotal > 0 ? discount / allItemsTotal : 0
        base = net * (1 - factor)
    }

    base = round2(base)

    const min = num(seller.min_protocol_value)
    if (min > 0 && protocol_total < min) {
        return { eligible: false, reason: `Protocolo abaixo do valor mínimo (${min.toFixed(2)})`, protocol_total, base, percent, commission: 0 }
    }

    if (!(percent > 0)) {
        return { eligible: false, reason: 'Vendedor sem percentual de comissão', protocol_total, base, percent, commission: 0 }
    }

    return { eligible: true, reason: null, protocol_total, base, percent, commission: round2((base * percent) / 100) }
}
