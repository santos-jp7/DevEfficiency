import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'
import moment from 'moment'

import Billing from '../models/Billing'
import Client from '../models/Client'
import Supplier from '../models/Supplier'
import Receipts from '../models/Receipts'
import Payable from '../models/Payable'
import BankAccount from '../models/BankAccount'
import BankTransfer from '../models/BankTransfer'
import BankStatementEntry, { MatchType } from '../models/BankStatementEntry'
import BankStatementImport from '../models/BankStatementImport'
import BankEntryMatch from '../models/BankEntryMatch'
import { StatementError } from '../utils/statementParser'
import {
    alreadyMatched,
    allocate,
    autoMatchPending,
    matchAllocations,
    matchedAmounts,
    remainingAmounts,
    billingLabel,
    brlText,
    compareStatementBalance,
    createExpenseFromEntry,
    describeMatches,
    entriesForTarget,
    findCandidates,
    findCombos,
    getTolerance,
    importStatement,
    loadTarget,
    looksLikeFee,
    unmatchEntry,
} from '../utils/reconciliation'

const TYPES: MatchType[] = ['billing', 'receipt', 'payable', 'transfer']

type Req = FastifyRequest<{ Params: { id: string }; Querystring: Record<string, any>; Body: Record<string, any> }>

const notFound = (res: FastifyReply, message: string) => res.status(404).send({ message })

// Máximo de lançamentos/linhas num vínculo (fatura de cartão com muitas compras).
const MAX_ITEMS = 300

// Liga linhas do extrato (1 ou várias) a lançamentos do sistema (1 ou vários), pelo valor que ainda falta conciliar
// de cada lançamento. Soma igual: concilia. Linhas somam menos: com `partial`, o restante do lançamento fica aberto
// para outra linha; com `force`, aceita a diferença. Linhas somam mais: só com `force` (diferença registrada).
async function linkEntries(res: FastifyReply, entries: BankStatementEntry[], rawTargets: any, body: any) {
    const { force, partial } = body || {}
    const targets: { type: MatchType; id: number }[] = Array.isArray(rawTargets) ? rawTargets : []

    if (entries.some((e) => e.status !== 'pendente')) return res.status(400).send({ message: 'Há linha do extrato já conciliada ou ignorada.' })
    if (targets.length === 0 || targets.length > MAX_ITEMS || targets.some((t) => !TYPES.includes(t.type) || !t.id))
        return res.status(400).send({ message: `Informe de 1 a ${MAX_ITEMS} lançamentos (tipo e id).` })

    const keys = new Set(targets.map((t) => `${t.type}:${t.id}`))
    if (keys.size !== targets.length) return res.status(400).send({ message: 'Lançamento repetido.' })

    const accountId = entries[0].BankAccountId
    const sign = Math.sign(Number(entries[0].amount))
    const entryIds = entries.map((e) => e.id)
    const loaded: { type: MatchType; id: number; value: number; date: string }[] = []

    for (const t of targets) {
        const target = await loadTarget(t.type, Number(t.id), accountId)

        if (!target) return notFound(res, `Lançamento ${t.type} #${t.id} não encontrado ou ainda não pago.`)
        if (target.BankAccountId !== accountId) return res.status(400).send({ message: 'O lançamento pertence a outra conta bancária.' })
        if (sign !== target.sign) return res.status(400).send({ message: 'Entrada/saída incompatível com o lançamento escolhido.' })

        // Só o que ainda não foi conciliado por outras linhas do extrato.
        const done = (await matchedAmounts(t.type, [Number(t.id)], { accountId, ignoreEntryId: entryIds })).get(Number(t.id)) || 0
        const remaining = Math.round((target.value - done) * 100) / 100
        if (remaining <= 0.009) return res.status(409).send({ message: `${t.type} #${t.id} já foi conciliado com outra(s) linha(s).` })

        loaded.push({ type: t.type, id: Number(t.id), value: remaining, date: target.date })
    }

    loaded.sort((a, b) => a.date.localeCompare(b.date) || a.value - b.value)
    const entriesTotal = entries.reduce((s, e) => s + Math.round(Math.abs(Number(e.amount)) * 100), 0) / 100
    const targetsTotal = loaded.reduce((s, t) => s + Math.round(t.value * 100), 0) / 100
    const difference = Math.round((entriesTotal - targetsTotal) * 100) / 100
    const tol = await getTolerance()

    let coverTargets = true
    if (Math.abs(difference) > tol) {
        if (difference < 0 && partial) coverTargets = false
        else if (!force)
            return res.status(409).send({
                message: 'Os valores divergem.',
                diverges: true,
                difference,
                entries_total: entriesTotal,
                targets_total: targetsTotal,
                // Linhas somam menos que os lançamentos: dá para registrar como parte e esperar o resto em outra linha.
                can_partial: difference < 0,
            })
    }

    const allocations = allocate(entries, loaded, { coverTargets })
    // Dentro da tolerância: o centavo de diferença fica registrado na linha, sem deixar restante aberto.
    try {
        await matchAllocations(allocations)
    } catch (err: any) {
        return res.status(400).send({ message: err.message })
    }

    return res.send(entries.length === 1 ? entries[0] : { entries, allocations: allocations.map((a) => ({ entry: a.entry.id, links: a.links, difference: a.difference })) })
}

class reconciliationController {
    static async entries(req: Req, res: FastifyReply) {
        const { BankAccountId, status, startDate, endDate, direction } = req.query

        if (!BankAccountId) return res.status(400).send({ message: 'Informe a conta bancária.' })

        const where: any = { BankAccountId }
        if (status) where.status = status
        if (startDate || endDate) {
            where.date = {}
            if (startDate) where.date[Op.gte] = startDate
            if (endDate) where.date[Op.lte] = endDate
        }
        if (direction === 'in') where.amount = { [Op.gt]: 0 }
        if (direction === 'out') where.amount = { [Op.lt]: 0 }

        const entries = await BankStatementEntry.findAll({
            where,
            order: [
                ['date', 'DESC'],
                ['id', 'DESC'],
            ],
            limit: 1000,
        })

        let suggestionBudget = 150
        const data = []

        for (const entry of entries) {
            const json: any = entry.toJSON()

            if (entry.status === 'conciliado') json.matches = await describeMatches(entry)
            else if (entry.status === 'pendente') {
                json.likely_fee = Number(entry.amount) < 0 && looksLikeFee(entry.description)

                if (suggestionBudget-- > 0) {
                    json.suggestions = await findCandidates(entry)
                    json.combos = json.suggestions.length ? [] : await findCombos(entry)
                }
            }

            data.push(json)
        }

        return res.send(data)
    }

    static async summary(req: Req, res: FastifyReply) {
        const { BankAccountId } = req.query
        if (!BankAccountId) return res.status(400).send({ message: 'Informe a conta bancária.' })

        const rows = await BankStatementEntry.findAll({ where: { BankAccountId }, attributes: ['status', 'amount'] })

        const summary = {
            pendente: { count: 0, in: 0, out: 0 },
            conciliado: { count: 0, in: 0, out: 0 },
            ignorado: { count: 0, in: 0, out: 0 },
        }

        for (const row of rows) {
            const bucket = summary[row.status as keyof typeof summary]
            bucket.count++
            if (Number(row.amount) > 0) bucket.in += Number(row.amount)
            else bucket.out += Math.abs(Number(row.amount))
        }

        const account = await BankAccount.findByPk(BankAccountId)

        return res.send({ ...summary, system_balance: account ? Number(account.balance) : null, tolerance: await getTolerance() })
    }

    static async imports(req: Req, res: FastifyReply) {
        const { BankAccountId } = req.query
        const where: any = BankAccountId ? { BankAccountId } : {}

        return res.send(await BankStatementImport.findAll({ where, order: [['createdAt', 'DESC']], limit: 50 }))
    }

    static async import(req: Req, res: FastifyReply) {
        const BankAccountId = Number(req.query.BankAccountId)

        if (!BankAccountId) return res.status(400).send({ message: 'Informe a conta bancária.' })

        const account = await BankAccount.findByPk(BankAccountId)
        if (!account) return notFound(res, 'Conta bancária não encontrada.')

        const file = await (req as any).file()
        if (!file) return res.status(400).send({ message: 'Arquivo não enviado.' })

        const chunks: Buffer[] = []
        for await (const chunk of file.file) chunks.push(chunk)
        const buffer = Buffer.concat(chunks)

        if (buffer.length === 0) return res.status(400).send({ message: 'Arquivo vazio.' })

        try {
            const result = await importStatement(BankAccountId, file.filename, buffer)
            return res.status(201).send(result)
        } catch (err) {
            if (err instanceof StatementError) return res.status(400).send({ message: err.message })
            throw err
        }
    }

    static async autoMatch(req: Req, res: FastifyReply) {
        const BankAccountId = Number(req.body?.BankAccountId)
        if (!BankAccountId) return res.status(400).send({ message: 'Informe a conta bancária.' })

        return res.send({ matched: await autoMatchPending(BankAccountId) })
    }

    // Vincula uma linha do extrato a um ou mais lançamentos (targets). Aceita também o formato antigo { type, id }.
    static async match(req: Req, res: FastifyReply) {
        const entry = await BankStatementEntry.findByPk(req.params.id)
        if (!entry) return notFound(res, 'Lançamento do extrato não encontrado.')

        const targets = Array.isArray(req.body.targets) ? req.body.targets : req.body.type ? [{ type: req.body.type, id: req.body.id }] : []
        return linkEntries(res, [entry], targets, req.body)
    }

    // Várias linhas do extrato de uma vez (ex.: 6k em espécie que entrou como 5k + 1k; fatura do cartão em partes).
    // Body: { entryIds: [..], targets: [{ type, id }], force?, partial? }.
    static async groupMatch(req: Req, res: FastifyReply) {
        const ids: number[] = Array.isArray(req.body.entryIds) ? [...new Set(req.body.entryIds.map(Number))] as number[] : []
        if (ids.length === 0 || ids.length > MAX_ITEMS) return res.status(400).send({ message: `Selecione de 1 a ${MAX_ITEMS} linhas do extrato.` })

        const entries = await BankStatementEntry.findAll({ where: { id: ids }, order: [['date', 'ASC'], ['id', 'ASC']] })
        if (entries.length !== ids.length) return notFound(res, 'Linha do extrato não encontrada.')
        if (new Set(entries.map((e) => e.BankAccountId)).size > 1) return res.status(400).send({ message: 'As linhas precisam ser da mesma conta bancária.' })
        if (new Set(entries.map((e) => Math.sign(Number(e.amount)))).size > 1)
            return res.status(400).send({ message: 'Selecione só entradas ou só saídas.' })

        return linkEntries(res, entries, req.body.targets, req.body)
    }

    // Tarifa/despesa que só aparece no banco: cria a conta paga e concilia numa operação.
    static async expense(req: Req, res: FastifyReply) {
        const entry = await BankStatementEntry.findByPk(req.params.id)
        if (!entry) return notFound(res, 'Lançamento do extrato não encontrado.')

        try {
            const payable = await createExpenseFromEntry(entry, {
                description: req.body.description,
                CostCenterId: req.body.CostCenterId || null,
                SupplierId: req.body.SupplierId || null,
            })
            return res.status(201).send({ payable, entry: await entry.reload() })
        } catch (err: any) {
            return res.status(400).send({ message: err.message })
        }
    }

    static async unmatch(req: Req, res: FastifyReply) {
        const entry = await BankStatementEntry.findByPk(req.params.id)
        if (!entry) return notFound(res, 'Lançamento do extrato não encontrado.')

        await unmatchEntry(entry)
        return res.send(entry)
    }

    static async ignore(req: Req, res: FastifyReply) {
        const entry = await BankStatementEntry.findByPk(req.params.id)
        if (!entry) return notFound(res, 'Lançamento do extrato não encontrado.')
        if (entry.status === 'conciliado') return res.status(400).send({ message: 'Desfaça a conciliação antes de ignorar.' })

        await entry.update({ status: 'ignorado' })
        return res.send(entry)
    }

    static async unignore(req: Req, res: FastifyReply) {
        const entry = await BankStatementEntry.findByPk(req.params.id)
        if (!entry) return notFound(res, 'Lançamento do extrato não encontrado.')

        await entry.update({ status: 'pendente' })
        return res.send(entry)
    }

    // Situação de um pagamento/recibo/conta frente ao extrato: conciliado, ou com linha candidata, ou sem extrato.
    static async status(req: Req, res: FastifyReply) {
        const { type, id, accountId } = req.query

        if (!TYPES.includes(type) || !id) return res.status(400).send({ message: 'Informe type e id.' })

        const matches = await BankEntryMatch.findAll({ where: { target_type: type, target_id: id }, include: [BankStatementEntry] })
        const own = accountId ? matches.filter((m) => (m as any).BankStatementEntry?.BankAccountId === Number(accountId)) : matches
        if (own.length) return res.send({ state: 'conciliado', entry: (own[0] as any).BankStatementEntry })

        const { target, entries } = await entriesForTarget(type, Number(id), accountId ? Number(accountId) : undefined)
        if (!target) return res.send({ state: 'indisponivel', entry: null, suggestions: [] })

        return res.send({ state: entries.length ? 'sugestao' : 'sem_extrato', entry: null, suggestions: entries })
    }

    // Lado do sistema: pagamentos/recebimentos já registrados que ainda não aparecem no extrato conciliado.
    static async unreconciled(req: Req, res: FastifyReply) {
        const { BankAccountId } = req.query
        const startDate = req.query.startDate || moment().subtract(60, 'days').format('YYYY-MM-DD')
        const endDate = req.query.endDate || moment().format('YYYY-MM-DD')

        if (!BankAccountId) return res.status(400).send({ message: 'Informe a conta bancária.' })

        const accountId = Number(BankAccountId)
        const from = moment(startDate).startOf('day').toDate()
        const to = moment(endDate).endOf('day').toDate()

        const matchedIds = async (type: MatchType) =>
            [...(await alreadyMatched(type, await candidateIds(type), { accountId }))]

        // Ids de cada tipo na janela (limita a consulta de vínculos).
        const candidateIds = async (type: MatchType): Promise<number[]> => {
            if (type === 'billing') return (await Billing.findAll({ where: { status: 'pago', BankAccountId: accountId, payment_date: { [Op.between]: [from, to] } }, attributes: ['id'] })).map((b) => b.id)
            if (type === 'receipt') return (await Receipts.findAll({ where: { BankAccountId: accountId, createdAt: { [Op.between]: [from, to] } }, attributes: ['id'] })).map((r) => r.id)
            if (type === 'payable') return (await Payable.findAll({ where: { status: 'pago', BankAccountId: accountId, paymentDate: { [Op.between]: [startDate, endDate] } }, attributes: ['id'] })).map((p) => p.id)
            return (await BankTransfer.findAll({ where: { canceledAt: null, date: { [Op.between]: [startDate, endDate] }, [Op.or]: [{ sourceAccountId: accountId }, { destinationAccountId: accountId }] }, attributes: ['id'] })).map((t) => t.id)
        }

        const [mb, mr, mp, mt] = await Promise.all([matchedIds('billing'), matchedIds('receipt'), matchedIds('payable'), matchedIds('transfer')])

        const billings = await Billing.findAll({
            where: { status: 'pago', BankAccountId, payment_date: { [Op.between]: [from, to] }, id: { [Op.notIn]: mb.length ? mb : [0] } },
            include: [Client, Supplier],
        })

        const receiptWhere: any = {
            BankAccountId,
            createdAt: { [Op.between]: [from, to] },
            id: { [Op.notIn]: mr.length ? mr : [0] },
            [Op.or]: [{ note: null }, { note: { [Op.notLike]: 'Recebido via cobrança%' } }],
        }
        const receipts: Receipts[] = await Receipts.findAll({ where: receiptWhere })

        const payables = await Payable.findAll({
            where: {
                status: 'pago',
                BankAccountId,
                paymentDate: { [Op.between]: [startDate, endDate] },
                id: { [Op.notIn]: mp.length ? mp : [0] },
            },
        })

        const transfers = await BankTransfer.findAll({
            where: {
                canceledAt: null,
                date: { [Op.between]: [startDate, endDate] },
                id: { [Op.notIn]: mt.length ? mt : [0] },
                [Op.or]: [{ sourceAccountId: accountId }, { destinationAccountId: accountId }],
            },
            include: [{ all: true }],
        })

        // Coberto em parte por linhas do extrato: aparece com o restante (e o total, para referência).
        const withRemaining = async (type: MatchType, items: any[]) => {
            const left = await remainingAmounts(type, new Map(items.map((i) => [i.id, i.value])), { accountId })
            return items.map((i) => {
                const r = left.get(i.id)!
                return { ...i, value: r.remaining, total: r.total, partial: r.partial, label: r.partial ? `${i.label} (restante de ${brlText(r.total)})` : i.label }
            })
        }

        return res.send({
            billings: await withRemaining(
                'billing',
                billings.map((b) => ({
                    type: 'billing',
                    id: b.id,
                    label: billingLabel(b),
                    value: Number(b.paid_value ?? b.total_value),
                    date: moment(b.payment_date).format('YYYY-MM-DD'),
                })),
            ),
            receipts: await withRemaining(
                'receipt',
                receipts.map((r) => ({
                    type: 'receipt',
                    id: r.id,
                    label: `Recibo #${r.id} (protocolo #${r.ProtocolId})`,
                    value: Number(r.value),
                    date: moment(r.createdAt).format('YYYY-MM-DD'),
                })),
            ),
            payables: await withRemaining(
                'payable',
                payables.map((p) => ({
                    type: 'payable',
                    id: p.id,
                    label: `Conta a pagar #${p.id} - ${p.description}`,
                    value: Number(p.value),
                    date: moment(p.paymentDate).format('YYYY-MM-DD'),
                })),
            ),
            transfers: await withRemaining(
                'transfer',
                transfers.map((t) => {
                    const outgoing = t.sourceAccountId === accountId
                    const other = outgoing ? (t as any).DestinationAccount : (t as any).SourceAccount
                    return {
                        type: 'transfer',
                        id: t.id,
                        label: `Transferência #${t.id} ${outgoing ? 'para' : 'de'} ${other?.name || '—'}`,
                        value: Number(t.amount),
                        date: moment(t.date).format('YYYY-MM-DD'),
                        direction: outgoing ? 'out' : 'in',
                    }
                }),
            ),
        })
    }

    // Saldo do extrato × saldo do sistema na mesma data.
    static async balanceCompare(req: Req, res: FastifyReply) {
        const BankAccountId = Number(req.query.BankAccountId)
        if (!BankAccountId) return res.status(400).send({ message: 'Informe a conta bancária.' })

        return res.send(await compareStatementBalance(BankAccountId))
    }

    // Informa manualmente o saldo final do extrato (CSV não traz saldo): grava na importação mais recente da conta.
    static async setStatementBalance(req: Req, res: FastifyReply) {
        const BankAccountId = Number(req.body.BankAccountId)
        const amount = Number(req.body.amount)
        const date = String(req.body.date || '')

        if (!BankAccountId || !Number.isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(date))
            return res.status(400).send({ message: 'Informe conta, saldo e data (AAAA-MM-DD).' })

        const latest = await BankStatementImport.findOne({ where: { BankAccountId }, order: [['id', 'DESC']] })
        if (!latest) return res.status(400).send({ message: 'Importe um extrato antes de informar o saldo.' })

        await latest.update({ statement_balance: Math.round(amount * 100) / 100, statement_balance_date: date })
        return res.send(await compareStatementBalance(BankAccountId))
    }
}

export default reconciliationController
