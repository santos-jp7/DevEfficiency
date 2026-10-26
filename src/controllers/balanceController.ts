import { FastifyRequest, FastifyReply } from 'fastify'

import db from '../db'
import BankAccount from '../models/BankAccount'
import BalanceAdjustment from '../models/BalanceAdjustment'
import { accountLedger, checkAccount, checkAllAccounts } from '../utils/balanceCheck'
import { runBalanceAlert } from '../utils/balanceAlert'

type Req = FastifyRequest<{ Params: { id: string }; Querystring: Record<string, any>; Body: Record<string, any> }>

const userOf = (req: any): string | null => req.__user?.user?.username || null

class balanceController {
    static async index(req: Req, res: FastifyReply) {
        return res.send(await checkAllAccounts())
    }

    static async show(req: Req, res: FastifyReply) {
        const account = await BankAccount.findByPk(req.params.id)
        if (!account) return res.status(404).send({ message: 'Conta bancária não encontrada.' })

        const adjustments = await BalanceAdjustment.findAll({
            where: { BankAccountId: account.id },
            order: [['id', 'DESC']],
            limit: 20,
        })

        return res.send({ ...(await checkAccount(account)), adjustments })
    }

    static async ledger(req: Req, res: FastifyReply) {
        const account = await BankAccount.findByPk(req.params.id)
        if (!account) return res.status(404).send({ message: 'Conta bancária não encontrada.' })

        return res.send(await accountLedger(account.id, req.query.startDate, req.query.endDate))
    }

    // Define o saldo inicial: explícito (opening_balance) ou "aceitar o atual" (accept_current), que assume que o
    // saldo gravado hoje está certo e deriva o saldo inicial a partir das movimentações. Sempre auditado.
    static async setOpening(req: Req, res: FastifyReply) {
        const account = await BankAccount.findByPk(req.params.id)
        if (!account) return res.status(404).send({ message: 'Conta bancária não encontrada.' })

        const check = await checkAccount(account)
        let value: number

        if (req.body.accept_current) value = check.implied_opening
        else {
            value = Number(req.body.opening_balance)
            if (!Number.isFinite(value)) return res.status(400).send({ message: 'Informe o saldo inicial.' })
        }

        value = Math.round(value * 100) / 100

        if (check.opening_balance !== null && !String(req.body.reason || '').trim())
            return res.status(400).send({ message: 'Informe o motivo para alterar um saldo inicial já definido.' })

        await db.transaction(async (transaction) => {
            await account.update({ opening_balance: value }, { transaction })
            await BalanceAdjustment.create(
                {
                    BankAccountId: account.id,
                    kind: 'saldo_inicial',
                    previous_value: check.opening_balance,
                    new_value: value,
                    reason: req.body.accept_current ? `Saldo atual aceito como correto. ${req.body.reason || ''}`.trim() : req.body.reason || null,
                    user: userOf(req),
                },
                { transaction },
            )
        })

        return res.send(await checkAccount(await account.reload()))
    }

    // Corrige o saldo gravado para o esperado pelas movimentações. Exige motivo e fica na trilha de auditoria.
    static async fix(req: Req, res: FastifyReply) {
        const reason = String(req.body.reason || '').trim()
        if (!reason) return res.status(400).send({ message: 'Informe o motivo da correção.' })

        const result = await db.transaction(async (transaction) => {
            const account = await BankAccount.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE })
            if (!account) return { code: 404, body: { message: 'Conta bancária não encontrada.' } }

            const check = await checkAccount(account)
            if (check.status === 'sem_saldo_inicial')
                return { code: 400, body: { message: 'Defina o saldo inicial da conta antes de corrigir o saldo.' } }
            if (check.status === 'ok') return { code: 400, body: { message: 'O saldo já está correto.' } }

            await account.update({ balance: check.expected as number }, { transaction })
            await BalanceAdjustment.create(
                { BankAccountId: account.id, kind: 'correcao_saldo', previous_value: check.balance, new_value: check.expected as number, reason, user: userOf(req) },
                { transaction },
            )

            return { code: 200, body: await checkAccount(await account.reload({ transaction })) }
        })

        return res.status(result.code).send(result.body)
    }

    // Dispara a conferência/aviso agora (ignora a trava de "já avisado").
    static async alertNow(req: Req, res: FastifyReply) {
        return res.send(await runBalanceAlert({ force: true }))
    }
}

export default balanceController
