import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'
import moment from 'moment'

import Billing from '../models/Billing'
import Client from '../models/Client'
import Receipts from '../models/Receipts'
import Payable from '../models/Payable'
import BankAccount from '../models/BankAccount'
import BankStatementEntry, { MatchType } from '../models/BankStatementEntry'
import BankStatementImport from '../models/BankStatementImport'
import { StatementError } from '../utils/statementParser'
import {
    autoMatchPending,
    describeTarget,
    entriesForTarget,
    findCandidates,
    importStatement,
    loadTarget,
    matchEntry,
    unmatchEntry,
} from '../utils/reconciliation'

const TYPES: MatchType[] = ['billing', 'receipt', 'payable']

type Req = FastifyRequest<{ Params: { id: string }; Querystring: Record<string, any>; Body: Record<string, any> }>

const notFound = (res: FastifyReply, message: string) => res.status(404).send({ message })

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

            if (entry.status === 'conciliado') json.matched_label = await describeTarget(entry.matched_type, entry.matched_id)
            else if (entry.status === 'pendente' && suggestionBudget-- > 0) json.suggestions = await findCandidates(entry)

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

        return res.send({ ...summary, system_balance: account ? Number(account.balance) : null })
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

    static async match(req: Req, res: FastifyReply) {
        const entry = await BankStatementEntry.findByPk(req.params.id)
        if (!entry) return notFound(res, 'Lançamento do extrato não encontrado.')

        const { type, id, force } = req.body || {}

        if (!TYPES.includes(type) || !id) return res.status(400).send({ message: 'Informe o tipo e o id do lançamento.' })
        if (entry.status === 'conciliado') return res.status(400).send({ message: 'Lançamento já conciliado.' })

        const target = await loadTarget(type, Number(id))
        if (!target) return notFound(res, 'Lançamento do sistema não encontrado ou ainda não pago.')

        if (target.BankAccountId !== entry.BankAccountId)
            return res.status(400).send({ message: 'O lançamento pertence a outra conta bancária.' })

        if (Math.sign(Number(entry.amount)) !== target.sign)
            return res.status(400).send({ message: 'Entrada/saída incompatível com o lançamento escolhido.' })

        if (!force && Math.abs(Math.abs(Number(entry.amount)) - target.value) > 0.01)
            return res.status(409).send({ message: 'Os valores divergem.', diverges: true })

        const taken = await BankStatementEntry.findOne({ where: { matched_type: type, matched_id: id } })
        if (taken) return res.status(409).send({ message: `Este lançamento já foi conciliado com a linha #${taken.id}.` })

        await matchEntry(entry, type, Number(id))
        return res.send(entry)
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
        const { type, id } = req.query

        if (!TYPES.includes(type) || !id) return res.status(400).send({ message: 'Informe type e id.' })

        const matched = await BankStatementEntry.findOne({ where: { matched_type: type, matched_id: id } })
        if (matched) return res.send({ state: 'conciliado', entry: matched })

        const { target, entries } = await entriesForTarget(type, Number(id))
        if (!target) return res.send({ state: 'indisponivel', entry: null, suggestions: [] })

        return res.send({ state: entries.length ? 'sugestao' : 'sem_extrato', entry: null, suggestions: entries })
    }

    // Lado do sistema: pagamentos/recebimentos já registrados que ainda não aparecem no extrato conciliado.
    static async unreconciled(req: Req, res: FastifyReply) {
        const { BankAccountId } = req.query
        const startDate = req.query.startDate || moment().subtract(60, 'days').format('YYYY-MM-DD')
        const endDate = req.query.endDate || moment().format('YYYY-MM-DD')

        if (!BankAccountId) return res.status(400).send({ message: 'Informe a conta bancária.' })

        const from = moment(startDate).startOf('day').toDate()
        const to = moment(endDate).endOf('day').toDate()

        const matchedIds = async (type: MatchType) =>
            (
                await BankStatementEntry.findAll({
                    where: { matched_type: type, BankAccountId },
                    attributes: ['matched_id'],
                })
            ).map((r) => Number(r.matched_id))

        const [mb, mr, mp] = await Promise.all([matchedIds('billing'), matchedIds('receipt'), matchedIds('payable')])

        const billings = await Billing.findAll({
            where: { status: 'pago', BankAccountId, payment_date: { [Op.between]: [from, to] }, id: { [Op.notIn]: mb.length ? mb : [0] } },
            include: [Client],
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

        return res.send({
            billings: billings.map((b) => ({
                type: 'billing',
                id: b.id,
                label: `Cobrança #${b.id}${(b as any).Client ? ` - ${(b as any).Client.name}` : ''}`,
                value: Number(b.total_value),
                date: moment(b.payment_date).format('YYYY-MM-DD'),
            })),
            receipts: receipts.map((r) => ({
                type: 'receipt',
                id: r.id,
                label: `Recibo #${r.id} (protocolo #${r.ProtocolId})`,
                value: Number(r.value),
                date: moment(r.createdAt).format('YYYY-MM-DD'),
            })),
            payables: payables.map((p) => ({
                type: 'payable',
                id: p.id,
                label: `Conta a pagar #${p.id} - ${p.description}`,
                value: Number(p.value),
                date: moment(p.paymentDate).format('YYYY-MM-DD'),
            })),
        })
    }
}

export default reconciliationController
