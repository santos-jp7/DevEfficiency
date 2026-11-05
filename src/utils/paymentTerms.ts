import moment from 'moment'
import { Transaction } from 'sequelize'

import Protocol from '../models/Protocol'
import ProtocolInstallment from '../models/ProtocolInstallment'
import Supplier from '../models/Supplier'
import { round2 } from './pricing'

export class PaymentTermsError extends Error {}

export const MAX_INSTALLMENTS = 24

// "15/30/60" → [15, 30, 60] (dias após a liberação). Aceita / , ; ou espaço. "0" = à vista na liberação.
export function parseTerms(terms: string | null | undefined): number[] | null {
    const text = String(terms ?? '').trim()
    if (!text) return null
    const days = text.split(/[\/,;\s]+/).filter(Boolean).map(Number)
    if (!days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 720))
        throw new PaymentTermsError('Condição de pagamento inválida. Use os dias separados por barra, ex.: 15/30/60.')
    if (days.length > MAX_INSTALLMENTS) throw new PaymentTermsError(`No máximo ${MAX_INSTALLMENTS} parcelas.`)
    for (let i = 1; i < days.length; i++)
        if (days[i] <= days[i - 1]) throw new PaymentTermsError('Os dias da condição de pagamento precisam ser crescentes (ex.: 15/30/60).')
    return days
}

export const normalizeTerms = (terms: string | null | undefined) => parseTerms(terms)?.join('/') ?? null

// Divide em partes iguais; a última parcela absorve os centavos.
export function splitAmount(total: number, parts: number): number[] {
    const each = Math.floor((round2(total) / parts) * 100) / 100
    const values = Array(parts).fill(each)
    values[parts - 1] = round2(total - each * (parts - 1))
    return values
}

export type PlannedInstallment = { number: number; due_date: string; value: number }

export function planFromTerms(days: number[], total: number, base: moment.MomentInput = new Date()): PlannedInstallment[] {
    const values = splitAmount(total, days.length)
    return days.map((d, i) => ({ number: i + 1, due_date: moment(base).add(d, 'days').format('YYYY-MM-DD'), value: values[i] }))
}

// Parcelas informadas à mão: datas válidas, valores > 0, na ordem das datas.
export function normalizeManual(rows: any[]): PlannedInstallment[] {
    if (!Array.isArray(rows) || rows.length === 0) throw new PaymentTermsError('Informe ao menos um vencimento.')
    if (rows.length > MAX_INSTALLMENTS) throw new PaymentTermsError(`No máximo ${MAX_INSTALLMENTS} parcelas.`)
    const list = rows.map((r) => {
        const date = moment(r?.due_date, 'YYYY-MM-DD', true)
        const value = round2(Number(r?.value))
        if (!date.isValid()) throw new PaymentTermsError('Vencimento com data inválida.')
        if (!(value > 0)) throw new PaymentTermsError('Toda parcela precisa de valor maior que zero.')
        return { due_date: date.format('YYYY-MM-DD'), value }
    })
    list.sort((a, b) => a.due_date.localeCompare(b.due_date))
    return list.map((r, i) => ({ number: i + 1, ...r }))
}

// Condição efetiva: a do protocolo; por comissão, sem condição própria, vale o padrão do fornecedor.
export async function effectiveTerms(protocol: Protocol, transaction?: Transaction | null): Promise<string | null> {
    if (protocol.payment_terms) return protocol.payment_terms
    if (protocol.billing_mode === 'Comissão' && protocol.CommissionSupplierId) {
        const supplier = await Supplier.findByPk(protocol.CommissionSupplierId, { transaction })
        return supplier?.default_payment_terms || null
    }
    return null
}

const sum = (list: { value: number }[]) => round2(list.reduce((s, i) => s + Number(i.value), 0))

// Valida (sem gravar) se o protocolo pode ser liberado com a condição/parcelas atuais para o valor em aberto.
export async function validateInstallmentsForRelease(protocol: Protocol, remaining: number, transaction?: Transaction | null) {
    if (protocol.installments_manual) {
        const open = await ProtocolInstallment.findAll({ where: { ProtocolId: protocol.id, status: 'pendente' }, transaction })
        const pending = round2(open.reduce((s, i) => s + i.value - i.paid_value, 0))
        if (Math.abs(pending - remaining) > 0.01)
            throw new PaymentTermsError(
                `As parcelas somam ${pending.toFixed(2)}, mas o valor a cobrar é ${remaining.toFixed(2)}. Ajuste os vencimentos antes de liberar.`,
            )
        return
    }
    parseTerms(await effectiveTerms(protocol, transaction))
}

// Parcelas a cobrar na liberação (null = cobrança única pelas regras de sempre).
// Manuais: as pendentes como estão. Pela condição: recria as pendentes a partir de hoje para o valor em aberto.
export async function installmentsForRelease(protocol: Protocol, remaining: number, transaction?: Transaction | null): Promise<ProtocolInstallment[] | null> {
    if (protocol.installments_manual) {
        const list = await ProtocolInstallment.findAll({ where: { ProtocolId: protocol.id, status: 'pendente' }, order: [['due_date', 'ASC']], transaction })
        return list.length ? list : null
    }

    const days = parseTerms(await effectiveTerms(protocol, transaction))
    if (!days || remaining <= 0) return null

    await ProtocolInstallment.destroy({ where: { ProtocolId: protocol.id, status: 'pendente', paid_value: 0 }, transaction })
    const offset = await ProtocolInstallment.count({ where: { ProtocolId: protocol.id }, transaction })
    const created: ProtocolInstallment[] = []
    for (const p of planFromTerms(days, remaining)) {
        created.push(await ProtocolInstallment.create({ ...p, number: p.number + offset, ProtocolId: protocol.id }, { transaction }))
    }
    return created
}

// Grava a condição/parcelas vindas do formulário (protocolo em aberto). installments preenchido = vencimentos manuais.
export async function saveInstallmentsInput(
    protocol: Protocol,
    input: { payment_terms?: any; installments?: any },
    transaction?: Transaction | null,
): Promise<void> {
    const patch: any = {}
    if ('payment_terms' in input) patch.payment_terms = normalizeTerms(input.payment_terms)

    if ('installments' in input) {
        const manual = Array.isArray(input.installments) && input.installments.length > 0
        patch.installments_manual = manual
        await ProtocolInstallment.destroy({ where: { ProtocolId: protocol.id, status: 'pendente', paid_value: 0 }, transaction })
        if (manual) {
            const offset = await ProtocolInstallment.count({ where: { ProtocolId: protocol.id }, transaction })
            for (const p of normalizeManual(input.installments))
                await ProtocolInstallment.create({ ...p, number: p.number + offset, ProtocolId: protocol.id }, { transaction })
        }
    }

    if (Object.keys(patch).length) await protocol.update(patch, { transaction })
}

// O que veio do formulário difere do que está gravado? (para travar mudança fora de "Em aberto").
export async function installmentsInputChanged(protocol: Protocol, input: { payment_terms?: any; installments?: any }): Promise<boolean> {
    if ('payment_terms' in input && normalizeTerms(input.payment_terms) !== (protocol.payment_terms || null)) return true
    if (!('installments' in input)) return false
    const manual = Array.isArray(input.installments) && input.installments.length > 0
    if (manual !== !!protocol.installments_manual) return true
    if (!manual) return false
    // O formulário edita só as parcelas ainda não pagas (as pagas aparecem só para consulta).
    const current = await ProtocolInstallment.findAll({ where: { ProtocolId: protocol.id, status: 'pendente', paid_value: 0 }, order: [['due_date', 'ASC']] })
    const next = normalizeManual(input.installments)
    if (current.length !== next.length) return true
    return current.some((c, i) => c.due_date !== next[i].due_date || Math.abs(c.value - next[i].value) > 0.009)
}

export const installmentsTotal = sum
