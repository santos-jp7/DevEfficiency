import moment from 'moment'
import { Op } from 'sequelize'

import db from '../db'
import Billing from '../models/Billing'
import Client from '../models/Client'
import Receipts from '../models/Receipts'
import Payable from '../models/Payable'
import BankAccount from '../models/BankAccount'
import BankTransfer from '../models/BankTransfer'
import BankStatementEntry, { MatchType } from '../models/BankStatementEntry'
import BankStatementImport from '../models/BankStatementImport'
import BankEntryMatch from '../models/BankEntryMatch'
import { getConfigValue } from './clientMail'
import { fileHash, parseStatement, round2 } from './statementParser'
import { accountLedger } from './balanceCheck'

// Janela (em dias) entre a data do extrato e a data em que o sistema registrou o pagamento/recebimento.
export const DATE_TOLERANCE_DAYS = 5
const BILLING_RECEIPT_NOTE = 'Recebido via cobrança'
const FEE_WORDS = /tarifa|taxa|iof|anuidade|manuten[cç][aã]o|juros|encargo|\bcesta\b|pacote/i

// Diferença máxima (R$) aceita para considerar extrato e sistema como o mesmo valor. Configurável.
export async function getTolerance(): Promise<number> {
    const value = Number(await getConfigValue('reconciliation_tolerance', '0.05'))
    return Number.isFinite(value) && value >= 0 ? value : 0.05
}

export type Candidate = {
    type: MatchType
    id: number
    label: string
    value: number
    date: string
}

const same = (a: number, b: number, tol: number) => Math.abs(round2(a) - round2(b)) <= tol + 1e-9
const day = (d: any) => moment(d).format('YYYY-MM-DD')

function window(date: string) {
    return [
        moment(date).subtract(DATE_TOLERANCE_DAYS, 'days').startOf('day').toDate(),
        moment(date).add(DATE_TOLERANCE_DAYS, 'days').endOf('day').toDate(),
    ] as const
}

// Lançamentos do sistema já vinculados a alguma linha do extrato. Para transferências, cada conta tem o seu lado
// (saída/entrada): só conta o vínculo feito por linha da mesma conta.
export async function alreadyMatched(
    type: MatchType,
    ids: number[],
    options: { ignoreEntryId?: number; accountId?: number } = {},
): Promise<Set<number>> {
    if (ids.length === 0) return new Set()

    const rows = await BankEntryMatch.findAll({
        where: { target_type: type, target_id: { [Op.in]: ids } },
        include: [{ model: BankStatementEntry, attributes: ['id', 'BankAccountId'], required: true }],
    })

    return new Set(
        rows
            .filter((r) => (options.ignoreEntryId ? (r as any).BankStatementEntry.id !== options.ignoreEntryId : true))
            .filter((r) => (type === 'transfer' && options.accountId ? (r as any).BankStatementEntry.BankAccountId === options.accountId : true))
            .map((r) => Number(r.target_id)),
    )
}

// Todos os lançamentos do sistema do sinal certo, na janela de datas e ainda sem vínculo — sem filtrar por valor.
async function candidatePool(entry: BankStatementEntry): Promise<Candidate[]> {
    const amount = Number(entry.amount)
    const [from, to] = window(entry.date)
    const out: Candidate[] = []

    if (amount > 0) {
        const billings = await Billing.findAll({
            where: { status: 'pago', BankAccountId: entry.BankAccountId, payment_date: { [Op.between]: [from, to] } },
            include: [Client],
        })
        const taken = await alreadyMatched('billing', billings.map((b) => b.id), { ignoreEntryId: entry.id })

        for (const b of billings)
            if (!taken.has(b.id))
                out.push({ type: 'billing', id: b.id, label: `Cobrança #${b.id}${(b as any).Client ? ` - ${(b as any).Client.name}` : ''}`, value: Number(b.paid_value ?? b.total_value), date: day(b.payment_date) })

        // Recibos de cobrança já estão cobertos pela própria cobrança; aqui entram só os recibos avulsos.
        const receiptWhere: any = {
            BankAccountId: entry.BankAccountId,
            createdAt: { [Op.between]: [from, to] },
            [Op.or]: [{ note: null }, { note: { [Op.notLike]: `${BILLING_RECEIPT_NOTE}%` } }],
        }
        const receipts: Receipts[] = await Receipts.findAll({ where: receiptWhere })
        const takenR = await alreadyMatched('receipt', receipts.map((r) => r.id), { ignoreEntryId: entry.id })

        for (const r of receipts)
            if (!takenR.has(r.id))
                out.push({ type: 'receipt', id: r.id, label: `Recibo #${r.id} (protocolo #${r.ProtocolId})${r.note ? ` - ${r.note}` : ''}`, value: Number(r.value), date: day(r.createdAt) })
    } else if (amount < 0) {
        const payables = await Payable.findAll({
            where: { status: 'pago', BankAccountId: entry.BankAccountId, paymentDate: { [Op.between]: [day(from), day(to)] } },
        })
        const taken = await alreadyMatched('payable', payables.map((p) => p.id), { ignoreEntryId: entry.id })

        for (const p of payables)
            if (!taken.has(p.id))
                out.push({ type: 'payable', id: p.id, label: `Conta a pagar #${p.id} - ${p.description}`, value: Number(p.value), date: day(p.paymentDate) })
    }

    // Transferências entre contas: saída (valor negativo) na origem, entrada na conta de destino.
    const transfers = await BankTransfer.findAll({
        where: {
            canceledAt: null,
            date: { [Op.between]: [day(from), day(to)] },
            ...(amount > 0 ? { destinationAccountId: entry.BankAccountId } : { sourceAccountId: entry.BankAccountId }),
        },
        include: [{ all: true }],
    })
    const takenT = await alreadyMatched('transfer', transfers.map((t) => t.id), { ignoreEntryId: entry.id, accountId: entry.BankAccountId })

    for (const t of transfers) {
        if (takenT.has(t.id)) continue
        const other = amount > 0 ? (t as any).SourceAccount : (t as any).DestinationAccount
        out.push({ type: 'transfer', id: t.id, label: `Transferência #${t.id} ${amount > 0 ? 'de' : 'para'} ${other?.name || `conta #${amount > 0 ? t.sourceAccountId : t.destinationAccountId}`}`, value: Number(t.amount), date: day(t.date) })
    }

    return out
}

const byProximity = (entry: BankStatementEntry) => (a: Candidate, b: Candidate) =>
    Math.abs(moment(a.date).diff(entry.date, 'days')) - Math.abs(moment(b.date).diff(entry.date, 'days'))

// Candidatos de valor igual ao da linha do extrato (dentro da tolerância).
export async function findCandidates(entry: BankStatementEntry, pool?: Candidate[]): Promise<Candidate[]> {
    const tol = await getTolerance()
    const all = pool || (await candidatePool(entry))

    return all.filter((c) => same(c.value, Math.abs(Number(entry.amount)), tol)).sort(byProximity(entry))
}

// Combinações de 2 ou 3 lançamentos cuja soma bate com a linha (ex.: um depósito que quitou duas faturas).
// Só são sugeridas — nunca aplicadas sozinhas.
export async function findCombos(entry: BankStatementEntry, pool?: Candidate[]): Promise<Candidate[][]> {
    const tol = await getTolerance()
    const target = Math.abs(Number(entry.amount))
    const items = (pool || (await candidatePool(entry)))
        .filter((c) => c.type !== 'transfer' && c.value > 0 && c.value < target - tol)
        .sort(byProximity(entry))
        .slice(0, 14)

    const found: Candidate[][] = []
    const check = (list: Candidate[]) => same(list.reduce((s, c) => s + c.value, 0), target, tol) && found.push(list)

    for (let i = 0; i < items.length && found.length < 3; i++)
        for (let j = i + 1; j < items.length && found.length < 3; j++) {
            check([items[i], items[j]])
            for (let k = j + 1; k < items.length && found.length < 3; k++) check([items[i], items[j], items[k]])
        }

    return found
}

export async function matchEntry(
    entry: BankStatementEntry,
    targets: { type: MatchType; id: number; value: number }[],
    options: { difference?: number | null } = {},
) {
    await db.transaction(async (transaction) => {
        await BankEntryMatch.destroy({ where: { BankStatementEntryId: entry.id }, transaction })
        await BankEntryMatch.bulkCreate(
            targets.map((t) => ({ BankStatementEntryId: entry.id, target_type: t.type, target_id: t.id, value: t.value })),
            { transaction },
        )
        await entry.update(
            { status: 'conciliado', matched_type: targets[0].type, matched_id: targets[0].id, matched_at: new Date(), match_difference: options.difference ?? null },
            { transaction },
        )
    })
}

export async function unmatchEntry(entry: BankStatementEntry) {
    await db.transaction(async (transaction) => {
        await BankEntryMatch.destroy({ where: { BankStatementEntryId: entry.id }, transaction })
        await entry.update({ status: 'pendente', matched_type: null, matched_id: null, matched_at: null, match_difference: null }, { transaction })
    })
}

// Concilia sozinho apenas quando há exatamente um candidato; ambiguidade e combinações ficam para decisão manual.
export async function autoMatchEntry(entry: BankStatementEntry): Promise<boolean> {
    if (entry.status !== 'pendente') return false

    const candidates = await findCandidates(entry)
    if (candidates.length !== 1) return false

    await matchEntry(entry, [{ type: candidates[0].type, id: candidates[0].id, value: candidates[0].value }])
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
    statement_balance: number | null
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
        statement_balance: parsed.balance?.amount ?? null,
        statement_balance_date: parsed.balance?.date ?? null,
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

    await statementImport.update({ inserted_entries: inserted, duplicate_entries: parsed.entries.length - inserted })

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
        statement_balance: parsed.balance?.amount ?? null,
    }
}

export type Target = { value: number; BankAccountId: number | null; date: string; sign: 1 | -1 }

// Dados do lançamento do sistema. Transferência depende do lado: `accountId` diz de qual conta é a linha do extrato.
export async function loadTarget(type: MatchType, id: number, accountId?: number): Promise<Target | null> {
    if (type === 'billing') {
        const b = await Billing.findByPk(id)
        if (!b || b.status !== 'pago' || !b.BankAccountId) return null
        return { value: Number(b.paid_value ?? b.total_value), BankAccountId: b.BankAccountId, date: day(b.payment_date), sign: 1 }
    }
    if (type === 'receipt') {
        const r = await Receipts.findByPk(id)
        if (!r || !r.BankAccountId) return null
        return { value: Number(r.value), BankAccountId: r.BankAccountId, date: day(r.createdAt), sign: 1 }
    }
    if (type === 'transfer') {
        const t = await BankTransfer.findByPk(id)
        if (!t || t.canceledAt || !accountId) return null
        if (t.destinationAccountId === accountId) return { value: Number(t.amount), BankAccountId: accountId, date: day(t.date), sign: 1 }
        if (t.sourceAccountId === accountId) return { value: Number(t.amount), BankAccountId: accountId, date: day(t.date), sign: -1 }
        return null
    }
    const p = await Payable.findByPk(id)
    if (!p || p.status !== 'pago' || !p.BankAccountId) return null
    return { value: Number(p.value), BankAccountId: p.BankAccountId, date: day(p.paymentDate || p.updatedAt), sign: -1 }
}

// Linhas pendentes do extrato que correspondem a um lançamento do sistema.
export async function entriesForTarget(type: MatchType, id: number, accountId?: number) {
    const target = await loadTarget(type, id, accountId)
    if (!target) return { target: null, entries: [] as BankStatementEntry[] }

    const tol = await getTolerance()
    const [from, to] = window(target.date)

    const entries = await BankStatementEntry.findAll({
        where: {
            BankAccountId: target.BankAccountId as number,
            status: 'pendente',
            date: { [Op.between]: [day(from), day(to)] },
            amount: target.sign > 0 ? { [Op.gt]: 0 } : { [Op.lt]: 0 },
        },
    })

    return { target, entries: entries.filter((e) => same(Math.abs(Number(e.amount)), target.value, tol)) }
}

// Chamado depois de fechar um pagamento (cobrança paga, recibo, conta paga, transferência): se o extrato já foi
// importado e há uma única linha correspondente, concilia na hora. Nunca derruba o fluxo principal.
export async function reconcileTarget(type: MatchType, id: number): Promise<void> {
    try {
        if (type === 'transfer') {
            const t = await BankTransfer.findByPk(id)
            if (!t) return
            for (const accountId of [t.sourceAccountId, t.destinationAccountId]) await reconcileSide(type, id, accountId)
            return
        }

        await reconcileSide(type, id)
    } catch (err) {
        console.error('[conciliação] falha ao conciliar automaticamente', type, id, err)
    }
}

async function reconcileSide(type: MatchType, id: number, accountId?: number) {
    if ((await alreadyMatched(type, [id], { accountId })).has(id)) return

    const { target, entries } = await entriesForTarget(type, id, accountId)
    if (target && entries.length === 1) await matchEntry(entries[0], [{ type, id, value: target.value }])
}

// O lançamento do sistema foi removido/estornado: as linhas do extrato ligadas a ele voltam a ficar pendentes.
export async function releaseTarget(type: MatchType, id: number): Promise<void> {
    try {
        const links = await BankEntryMatch.findAll({ where: { target_type: type, target_id: id } })
        const entryIds = [...new Set(links.map((l) => l.BankStatementEntryId))]

        for (const entryId of entryIds) {
            const entry = await BankStatementEntry.findByPk(entryId)
            if (entry) await unmatchEntry(entry) // vínculo múltiplo: sem um dos itens, a linha inteira volta a pendente
        }
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
    if (type === 'transfer') {
        const t = await BankTransfer.findByPk(id, { include: [{ all: true }] })
        return t ? `Transferência #${t.id} (${(t as any).SourceAccount?.name || t.sourceAccountId} → ${(t as any).DestinationAccount?.name || t.destinationAccountId})` : null
    }

    const p = await Payable.findByPk(id)
    return p ? `Conta a pagar #${p.id} - ${p.description}` : null
}

export async function describeMatches(entry: BankStatementEntry) {
    const links = await BankEntryMatch.findAll({ where: { BankStatementEntryId: entry.id }, order: [['id', 'ASC']] })
    return Promise.all(
        links.map(async (l) => ({ type: l.target_type, id: l.target_id, value: l.value, label: await describeTarget(l.target_type, l.target_id) })),
    )
}

export const looksLikeFee = (description?: string | null) => !!description && FEE_WORDS.test(description)

// Tarifa/despesa que só existe no banco: lança como conta a pagar já paga (o saldo da conta acompanha) e concilia.
export async function createExpenseFromEntry(
    entry: BankStatementEntry,
    options: { description?: string; CostCenterId?: number | null; SupplierId?: number | null } = {},
): Promise<Payable> {
    const amount = Number(entry.amount)
    if (entry.status !== 'pendente') throw new Error('Só linhas pendentes podem virar despesa.')
    if (!(amount < 0)) throw new Error('Só saídas (valores negativos) podem ser lançadas como despesa.')

    return db.transaction(async (transaction) => {
        const payable = await Payable.create(
            {
                description: (options.description || entry.description || 'Despesa bancária').slice(0, 255),
                value: Math.abs(amount),
                dueDate: entry.date as any,
                paymentDate: entry.date as any,
                status: 'pago',
                BankAccountId: entry.BankAccountId,
                CostCenterId: (options.CostCenterId || null) as any,
                SupplierId: (options.SupplierId || null) as any,
            },
            { transaction },
        )

        await BankEntryMatch.destroy({ where: { BankStatementEntryId: entry.id }, transaction })
        await BankEntryMatch.create({ BankStatementEntryId: entry.id, target_type: 'payable', target_id: payable.id, value: Math.abs(amount) }, { transaction })
        await entry.update({ status: 'conciliado', matched_type: 'payable', matched_id: payable.id, matched_at: new Date(), match_difference: null }, { transaction })

        return payable
    })
}

// Saldo do extrato (informado pelo banco) × saldo do sistema na mesma data. As linhas ainda pendentes do extrato
// explicam parte da diferença (movimento que o banco tem e o sistema ainda não).
export async function compareStatementBalance(BankAccountId: number) {
    const latest = await BankStatementImport.findOne({
        where: { BankAccountId, statement_balance: { [Op.ne]: null as any } },
        order: [['statement_balance_date', 'DESC'], ['id', 'DESC']],
    })
    if (!latest || !latest.statement_balance_date) return { available: false as const, reason: 'Nenhum extrato com saldo final informado. Importe um OFX ou informe o saldo manualmente.' }

    const account = await BankAccount.findByPk(BankAccountId)
    if (!account) return { available: false as const, reason: 'Conta não encontrada.' }
    if (account.opening_balance === null || account.opening_balance === undefined)
        return { available: false as const, reason: 'Defina o saldo inicial da conta (Contas Bancárias) para comparar com o extrato.' }

    const asOf = latest.statement_balance_date
    const ledger = (await accountLedger(BankAccountId, undefined, asOf)).reduce((s, r) => s + Math.round(r.value * 100), 0)
    const systemAtDate = round2(Number(account.opening_balance) + ledger / 100)

    const pending = await BankStatementEntry.findAll({ where: { BankAccountId, status: 'pendente', date: { [Op.lte]: asOf } } })
    const pendingNet = round2(pending.reduce((s, e) => s + Number(e.amount), 0))

    const statement = Number(latest.statement_balance)

    return {
        available: true as const,
        as_of: asOf,
        import_id: latest.id,
        filename: latest.filename,
        statement_balance: statement,
        system_balance_at_date: systemAtDate,
        difference: round2(statement - systemAtDate),
        pending_entries: pending.length,
        pending_net: pendingNet,
        // O que sobra depois de considerar o que o banco tem e o sistema ainda não lançou.
        unexplained: round2(statement - (systemAtDate + pendingNet)),
    }
}
