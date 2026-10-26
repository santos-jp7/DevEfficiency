import { Op } from 'sequelize'
import moment from 'moment'

import BankAccount from '../models/BankAccount'
import Receipts from '../models/Receipts'
import Payable from '../models/Payable'
import Reimbursement from '../models/Reimbursement'
import BankTransfer from '../models/BankTransfer'

// Conferência de saldo: o saldo gravado na conta precisa ser igual a
//   saldo inicial + recebimentos + ressarcimentos + transferências recebidas
//                 − contas pagas − transferências enviadas.
// Tudo é somado em centavos inteiros para não herdar ruído de ponto flutuante.
const cents = (n: unknown) => Math.round((Number(n) || 0) * 100)
const money = (c: number) => c / 100

export type BalanceStatus = 'ok' | 'divergente' | 'sem_saldo_inicial'

export type BalanceCheck = {
    id: number
    name: string
    balance: number
    opening_balance: number | null
    receipts: number
    reimbursements: number
    transfers_in: number
    payables: number
    transfers_out: number
    ledger: number // soma das movimentações (sem saldo inicial)
    expected: number | null // saldo inicial + ledger
    difference: number | null // saldo gravado − esperado
    implied_opening: number // saldo inicial que explicaria o saldo atual
    status: BalanceStatus
}

async function totals(id: number) {
    const [receipts, reimbursements, tin, payables, tout] = await Promise.all([
        Receipts.sum('value', { where: { BankAccountId: id } }),
        Reimbursement.sum('value', { where: { BankAccountId: id } }),
        BankTransfer.sum('amount', { where: { destinationAccountId: id } }),
        Payable.sum('value', { where: { BankAccountId: id, status: 'pago' } }),
        BankTransfer.sum('amount', { where: { sourceAccountId: id } }),
    ])

    return { receipts: cents(receipts), reimbursements: cents(reimbursements), tin: cents(tin), payables: cents(payables), tout: cents(tout) }
}

export async function checkAccount(account: BankAccount): Promise<BalanceCheck> {
    const t = await totals(account.id)
    const ledger = t.receipts + t.reimbursements + t.tin - t.payables - t.tout
    const balance = cents(account.balance)
    const opening = account.opening_balance === null || account.opening_balance === undefined ? null : cents(account.opening_balance)

    const expected = opening === null ? null : opening + ledger
    const difference = expected === null ? null : balance - expected

    return {
        id: account.id,
        name: account.name,
        balance: money(balance),
        opening_balance: opening === null ? null : money(opening),
        receipts: money(t.receipts),
        reimbursements: money(t.reimbursements),
        transfers_in: money(t.tin),
        payables: money(t.payables),
        transfers_out: money(t.tout),
        ledger: money(ledger),
        expected: expected === null ? null : money(expected),
        difference: difference === null ? null : money(difference),
        implied_opening: money(balance - ledger),
        status: opening === null ? 'sem_saldo_inicial' : difference === 0 ? 'ok' : 'divergente',
    }
}

export async function checkAllAccounts(): Promise<BalanceCheck[]> {
    const accounts = await BankAccount.findAll({ order: [['name', 'ASC']] })
    return Promise.all(accounts.map(checkAccount))
}

export type LedgerRow = { date: string; type: string; description: string; value: number; ref: string }

// Extrato das movimentações que compõem o saldo — para achar qual lançamento causa a diferença.
export async function accountLedger(id: number, startDate?: string, endDate?: string): Promise<LedgerRow[]> {
    const inRange = (d: any) => {
        const day = moment(d).format('YYYY-MM-DD')
        return (!startDate || day >= startDate) && (!endDate || day <= endDate)
    }

    const [receipts, payables, reimbursements, transfers] = await Promise.all([
        Receipts.findAll({ where: { BankAccountId: id } }),
        Payable.findAll({ where: { BankAccountId: id, status: 'pago' } }),
        Reimbursement.findAll({ where: { BankAccountId: id } }),
        BankTransfer.findAll({ where: { [Op.or]: [{ sourceAccountId: id }, { destinationAccountId: id }] } }),
    ])

    const rows: LedgerRow[] = [
        ...receipts.map((r) => ({ date: moment(r.createdAt).format('YYYY-MM-DD'), type: 'Recebimento', description: `Protocolo #${r.ProtocolId}${r.note ? ` — ${r.note}` : ''}`, value: Number(r.value), ref: `receipt:${r.id}` })),
        ...reimbursements.map((r) => ({ date: moment(r.createdAt).format('YYYY-MM-DD'), type: 'Ressarcimento', description: r.description, value: Number(r.value), ref: `reimbursement:${r.id}` })),
        ...payables.map((p) => ({ date: moment(p.paymentDate || p.updatedAt).format('YYYY-MM-DD'), type: 'Conta paga', description: p.description, value: -Number(p.value), ref: `payable:${p.id}` })),
        ...transfers.map((t) => ({
            date: moment(t.date).format('YYYY-MM-DD'),
            type: t.destinationAccountId === id ? 'Transferência recebida' : 'Transferência enviada',
            description: `Conta #${t.destinationAccountId === id ? t.sourceAccountId : t.destinationAccountId}`,
            value: t.destinationAccountId === id ? Number(t.amount) : -Number(t.amount),
            ref: `transfer:${t.id}`,
        })),
    ]

    return rows.filter((r) => inRange(r.date)).sort((a, b) => b.date.localeCompare(a.date))
}
