import { FastifyRequest, FastifyReply } from 'fastify'
import BankTransfer from '../models/BankTransfer'
import BankAccount from '../models/BankAccount'
import db from '../db'
import { reconcileTarget, releaseTarget } from '../utils/reconciliation'

type bankTransferRequest = FastifyRequest<{
    Body: BankTransfer
    Params: BankTransfer
    Headers: any
    Querystring: BankTransfer
}>

class bankTransferController {
    static async index(req: bankTransferRequest, reply: FastifyReply) {
        const transfers = await BankTransfer.findAll({ include: [{ all: true }] })
        reply.send(transfers)
    }

    static async show(req: bankTransferRequest, reply: FastifyReply) {
        const { id } = req.params
        const transfer = await BankTransfer.findByPk(id)
        reply.send(transfer)
    }

    static async store(req: bankTransferRequest, reply: FastifyReply) {
        const t = await db.transaction()
        try {
            const { sourceAccountId, destinationAccountId, date } = req.body as BankTransfer
            const amount = Math.round(Number((req.body as BankTransfer).amount) * 100) / 100

            if (!(amount > 0)) {
                await t.rollback()
                return reply.status(400).send({ message: 'Informe um valor maior que zero.' })
            }
            if (Number(sourceAccountId) === Number(destinationAccountId)) {
                await t.rollback()
                return reply.status(400).send({ message: 'Origem e destino devem ser contas diferentes.' })
            }

            // Trava as duas contas (ordem fixa por id: evita deadlock entre transferências opostas simultâneas).
            const [first, second] = [Number(sourceAccountId), Number(destinationAccountId)].sort((x, y) => x - y)
            await BankAccount.findByPk(first, { transaction: t, lock: t.LOCK.UPDATE })
            await BankAccount.findByPk(second, { transaction: t, lock: t.LOCK.UPDATE })

            const sourceAccount = await BankAccount.findByPk(sourceAccountId, { transaction: t })
            const destinationAccount = await BankAccount.findByPk(destinationAccountId, { transaction: t })

            if (!sourceAccount || !destinationAccount) {
                await t.rollback()
                return reply.status(404).send({ message: 'Conta de origem ou destino não encontrada' })
            }

            if (Math.round(Number(sourceAccount.balance) * 100) < Math.round(amount * 100)) {
                await t.rollback()
                return reply.status(400).send({ message: 'Saldo insuficiente' })
            }

            await BankAccount.decrement('balance', { by: amount, where: { id: sourceAccount.id }, transaction: t })
            await BankAccount.increment('balance', { by: amount, where: { id: destinationAccount.id }, transaction: t })

            const transfer = await BankTransfer.create({ sourceAccountId, destinationAccountId, amount, date }, { transaction: t })

            await t.commit()

            // Se o extrato das duas contas já foi importado, tenta vincular a saída e a entrada.
            await reconcileTarget('transfer', transfer.id)

            reply.send(transfer)
        } catch (error) {
            await t.rollback()
            reply.status(500).send(error)
        }
    }

    // Cancelamento (estorno) de uma transferência: devolve o valor à origem e retira do destino. Fica no histórico.
    static async cancel(req: bankTransferRequest, reply: FastifyReply) {
        const reason = String((req.body as any)?.reason || '').trim()
        if (!reason) return reply.status(400).send({ message: 'Informe o motivo do cancelamento.' })

        const t = await db.transaction()
        try {
            const transfer = await BankTransfer.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE })

            if (!transfer) {
                await t.rollback()
                return reply.status(404).send({ message: 'Transferência não encontrada' })
            }
            if (transfer.canceledAt) {
                await t.rollback()
                return reply.status(400).send({ message: 'Transferência já cancelada' })
            }

            const amount = Number(transfer.amount)
            const [first, second] = [transfer.sourceAccountId, transfer.destinationAccountId].sort((x, y) => x - y)
            await BankAccount.findByPk(first, { transaction: t, lock: t.LOCK.UPDATE })
            await BankAccount.findByPk(second, { transaction: t, lock: t.LOCK.UPDATE })

            const destination = await BankAccount.findByPk(transfer.destinationAccountId, { transaction: t })

            // O dinheiro precisa ainda estar na conta de destino para voltar.
            if (!destination || Math.round(Number(destination.balance) * 100) < Math.round(amount * 100)) {
                await t.rollback()
                return reply.status(400).send({ message: 'Saldo insuficiente na conta de destino para desfazer a transferência.' })
            }

            await BankAccount.increment('balance', { by: amount, where: { id: transfer.sourceAccountId }, transaction: t })
            await BankAccount.decrement('balance', { by: amount, where: { id: transfer.destinationAccountId }, transaction: t })
            await transfer.update({ canceledAt: new Date(), cancel_reason: reason }, { transaction: t })

            await t.commit()
            await releaseTarget('transfer', transfer.id)
            return reply.send(transfer)
        } catch (error) {
            await t.rollback()
            console.error(error)
            return reply.status(500).send({ message: 'Erro ao cancelar a transferência.' })
        }
    }

    static async update(req: bankTransferRequest, reply: FastifyReply) {
        reply.send({ message: 'Not implemented' })
    }

    static async destroy(req: bankTransferRequest, reply: FastifyReply) {
        reply.send({ message: 'Not implemented' })
    }
}

export default bankTransferController
