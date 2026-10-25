import moment from 'moment'
import { Op } from 'sequelize'

import Billing from '../models/Billing'
import Client from '../models/Client'
import Receipts from '../models/Receipts'
import Payable from '../models/Payable'
import BankStatementEntry, { MatchType } from '../models/BankStatementEntry'
import BankStatementImport from '../models/BankStatementImport'
import { fileHash, parseStatement, round2 } from './statementParser'

// Janela (em dias) entre a data do extrato e a data em que o sistema registrou o pagamento/recebimento.
export const DATE_TOLERANCE_DAYS = 5
const VALUE_TOLERANCE = 0.01

export type Candidate = {
    type: MatchType
    id: number
    label: string
    value: number
    date: string
}

const BILLING_RECEIPT_NOTE = 'Recebido via cobrança'

const sameValue = (a: number, b: number) => Math.abs(round2(a) - round2(b)) <= VALUE_TOLERANCE
const day = (d: any) => moment(d).format('YYYY-MM-DD')

export async function alreadyMatched(type: MatchType, ids: number[], ignoreEntryId?: number): Promise<Set<number>> {
    if (ids.length === 0) return new Set()

    const rows = await BankStatementEntry.findAll({
        where: {
            matched_type: type,
            matched_id: { [Op.in]: ids },
            ...(ignoreEntryId ? { id: { [Op.ne]: ignoreEntryId } } : {}),
        },
        attributes: ['matched_id'],
    })

    return new Set(rows.map((r) => Number(r.matched_id)))
}

function window(date: string) {
    return [
        moment(date).subtract(DATE_TOLERANCE_DAYS, 'days').startOf('day').toDate(),
        moment(date).add(DATE_TOLERANCE_DAYS, 'days').endOf('day').toDate(),
    ] as const
}

// Lançamentos do sistema que podem corresponder a uma linha do extrato.
export async function findCandidates(entry: BankStatementEntry): Promise<Candidate[]> {
    const amount = Number(entry.amount)
    const [from, to] = window(entry.date)
    const candidates: Candidate[] = []

    if (amount > 0) {
        const billings = await Billing.findAll({
            where: { status: 'pago', BankAccountId: entry.BankAccountId, payment_date: { [Op.between]: [from, to] } },
            include: [Client],
        })

        const taken = await alreadyMatched('billing', billings.map((b) => b.id), entry.id)

        for (const b of billings) {
            if (taken.has(b.id) || !sameValue(Number(b.total_value), amount)) continue
            candidates.push({
                type: 'billing',
                id: b.id,
                label: `Cobrança #${b.id}${(b as any).Client ? ` - ${(b as any).Client.name}` : ''}`,
                value: Number(b.total_value),
                date: day(b.payment_date),
            })
        }

        // Recibos de cobrança já estão cobertos pela própria cobrança; aqui entram só os recibos avulsos.
        const receiptWhere: any = {
            BankAccountId: entry.BankAccountId,
            createdAt: { [Op.between]: [from, to] },
            [Op.or]: [{ note: null }, { note: { [Op.notLike]: `${BILLING_RECEIPT_NOTE}%` } }],
        }
        const receipts: Receipts[] = await Receipts.findAll({ where: receiptWhere })

        const takenReceipts = await alreadyMatched('receipt', receipts.map((r) => r.id), entry.id)

        for (const r of receipts) {
            if (takenReceipts.has(r.id) || !sameValue(Number(r.value), amount)) continue
            candidates.push({
                type: 'receipt',
                id: r.id,
                label: `Recibo #${r.id} (protocolo #${r.ProtocolId})${r.note ? ` - ${r.note}` : ''}`,
                value: Number(r.value),
                date: day(r.createdAt),
            })
        }
    } else if (amount < 0) {
        const payables = await Payable.findAll({
            where: {
                status: 'pago',
                BankAccountId: entry.BankAccountId,
                paymentDate: { [Op.between]: [day(from), day(to)] },
            },
        })

        const taken = await alreadyMatched('payable', payables.map((p) => p.id), entry.id)

        for (const p of payables) {
            if (taken.has(p.id) || !sameValue(Number(p.value), Math.abs(amount))) continue
            candidates.push({
                type: 'payable',
                id: p.id,
                label: `Conta a pagar #${p.id} - ${p.description}`,
                value: Number(p.value),
                date: day(p.paymentDate),
            })
        }
    }

    // Mais próximo da data do extrato primeiro.
    return candidates.sort(
        (a, b) =>
            Math.abs(moment(a.date).diff(entry.date, 'days')) - Math.abs(moment(b.date).diff(entry.date, 'days')),
    )
}

export async function matchEntry(entry: BankStatementEntry, type: MatchType, id: number) {
    await entry.update({ status: 'conciliado', matched_type: type, matched_id: id, matched_at: new Date() })
}

export async function unmatchEntry(entry: BankStatementEntry) {
    await entry.update({ status: 'pendente', matched_type: null, matched_id: null, matched_at: null })
}

// Concilia sozinho apenas quando há exatamente um candidato; ambiguidade fica para decisão manual.
export async function autoMatchEntry(entry: BankStatementEntry): Promise<boolean> {
    if (entry.status !== 'pendente') return false

    const candidates = await findCandidates(entry)
    if (candidates.length !== 1) return false

    await matchEntry(entry, candidates[0].type, candidates[0].id)
    return true
}

export async function autoMatchPending(BankAccountId: number): Promise<number> {
    const pending = await BankStatementEntry.findAll({ where: { BankAccountId, status: 'pendente' } })

    let matched = 0
    for (const entry of pending) if (await autoMatchEntry(entry)) matched++

    return matched
}

export type ImportResult = {
    import: BankStatementImport
    format: 'ofx' | 'csv'
    total: number
    inserted: number
    duplicates: number
    auto_matched: number
    already_imported_file: boolean
}

export async function importStatement(BankAccountId: number, filename: string, buffer: Buffer): Promise<ImportResult> {
    const parsed = parseStatement(buffer, filename)
    const hash = fileHash(buffer)

    const alreadyImportedFile = !!(await BankStatementImport.findOne({ where: { BankAccountId, file_hash: hash } }))

    const keys = parsed.entries.map((e) => e.dedupe_key)
    const existing = new Set<string>()

    // Consulta em lotes para não estourar o limite de parâmetros em extratos grandes.
    for (let i = 0; i < keys.length; i += 500) {
        const rows = await BankStatementEntry.findAll({
            where: { BankAccountId, dedupe_key: { [Op.in]: keys.slice(i, i + 500) } },
            attributes: ['dedupe_key'],
        })
        rows.forEach((r) => existing.add(r.dedupe_key))
    }

    const fresh = parsed.entries.filter((e) => !existing.has(e.dedupe_key))
    const dates = parsed.entries.map((e) => e.date).sort()

    const statementImport = await BankStatementImport.create({
        BankAccountId,
        filename,
        format: parsed.format,
        file_hash: hash,
        total_entries: parsed.entries.length,
        inserted_entries: 0,
        duplicate_entries: 0,
        period_start: dates[0] || null,
        period_end: dates[dates.length - 1] || null,
    })

    if (fresh.length > 0) {
        // O índice único (conta + chave) é a garantia final contra duplicidade em importações simultâneas.
        await BankStatementEntry.bulkCreate(
            fresh.map((e) => ({
                BankAccountId,
                BankStatementImportId: statementImport.id,
                dedupe_key: e.dedupe_key,
                external_id: e.external_id,
                date: e.date,
                amount: e.amount,
                description: e.description.slice(0, 512),
            })),
            { ignoreDuplicates: true },
        )
    }

    const inserted = await BankStatementEntry.count({ where: { BankStatementImportId: statementImport.id } })

    await statementImport.update({
        inserted_entries: inserted,
        duplicate_entries: parsed.entries.length - inserted,
    })

    let autoMatched = 0
    const created = await BankStatementEntry.findAll({ where: { BankStatementImportId: statementImport.id } })
    for (const entry of created) if (await autoMatchEntry(entry)) autoMatched++

    return {
        import: statementImport,
        format: parsed.format,
        total: parsed.entries.length,
        inserted,
        duplicates: parsed.entries.length - inserted,
        auto_matched: autoMatched,
        already_imported_file: alreadyImportedFile,
    }
}

type Target = { value: number; BankAccountId: number | null; date: string; sign: 1 | -1 }

async function loadTarget(type: MatchType, id: number): Promise<Target | null> {
    if (type === 'billing') {
        const b = await Billing.findByPk(id)
        if (!b || b.status !== 'pago' || !b.BankAccountId) return null
        return { value: Number(b.total_value), BankAccountId: b.BankAccountId, date: day(b.payment_date), sign: 1 }
    }
    if (type === 'receipt') {
        const r = await Receipts.findByPk(id)
        if (!r || !r.BankAccountId) return null
        return { value: Number(r.value), BankAccountId: r.BankAccountId, date: day(r.createdAt), sign: 1 }
    }
    const p = await Payable.findByPk(id)
    if (!p || p.status !== 'pago' || !p.BankAccountId) return null
    return { value: Number(p.value), BankAccountId: p.BankAccountId, date: day(p.paymentDate || p.updatedAt), sign: -1 }
}

// Linhas pendentes do extrato que correspondem a um lançamento do sistema.
export async function entriesForTarget(type: MatchType, id: number) {
    const target = await loadTarget(type, id)
    if (!target) return { target: null, entries: [] as BankStatementEntry[] }

    const [from, to] = window(target.date)

    const entries = await BankStatementEntry.findAll({
        where: {
            BankAccountId: target.BankAccountId as number,
            status: 'pendente',
            date: { [Op.between]: [day(from), day(to)] },
            amount: target.sign > 0 ? { [Op.gt]: 0 } : { [Op.lt]: 0 },
        },
    })

    return {
        target,
        entries: entries.filter((e) => sameValue(Math.abs(Number(e.amount)), target.value)),
    }
}

// Chamado depois de fechar um pagamento (cobrança paga, recibo, conta paga): se o extrato já foi importado e há
// uma única linha correspondente, concilia na hora. Nunca derruba o fluxo principal.
export async function reconcileTarget(type: MatchType, id: number): Promise<void> {
    try {
        const already = await BankStatementEntry.findOne({ where: { matched_type: type, matched_id: id } })
        if (already) return

        const { entries } = await entriesForTarget(type, id)
        if (entries.length === 1) await matchEntry(entries[0], type, id)
    } catch (err) {
        console.error('[conciliação] falha ao conciliar automaticamente', type, id, err)
    }
}

// O lançamento do sistema foi removido/estornado: a linha do extrato volta a ficar pendente.
export async function releaseTarget(type: MatchType, id: number): Promise<void> {
    try {
        await BankStatementEntry.update(
            { status: 'pendente', matched_type: null, matched_id: null, matched_at: null },
            { where: { matched_type: type, matched_id: id } },
        )
    } catch (err) {
        console.error('[conciliação] falha ao liberar conciliação', type, id, err)
    }
}

export async function describeTarget(type: MatchType | null, id: number | null): Promise<string | null> {
    if (!type || !id) return null

    if (type === 'billing') {
        const b = await Billing.findByPk(id, { include: [Client] })
        return b ? `Cobrança #${b.id}${(b as any).Client ? ` - ${(b as any).Client.name}` : ''}` : null
    }
    if (type === 'receipt') {
        const r = await Receipts.findByPk(id)
        return r ? `Recibo #${r.id} (protocolo #${r.ProtocolId})` : null
    }

    const p = await Payable.findByPk(id)
    return p ? `Conta a pagar #${p.id} - ${p.description}` : null
}

export { loadTarget }
