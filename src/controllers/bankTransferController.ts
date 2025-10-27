import { FastifyRequest, FastifyReply } from 'fastify'
import BankTransfer from '../models/BankTransfer'
import BankAccount from '../models/BankAccount'
import db from '../db'

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
            const { sourceAccountId, destinationAccountId, amount, date } = req.body as BankTransfer

            const sourceAccount = await BankAccount.findByPk(sourceAccountId, { transaction: t })
            const destinationAccount = await BankAccount.findByPk(destinationAccountId, { transaction: t })

            if (!sourceAccount || !destinationAccount) {
                return reply.status(404).send({ message: 'Conta de origem ou destino não encontrada' })
            }

            if (sourceAccount.balance < amount) {
                return reply.status(400).send({ message: 'Saldo insuficiente' })
            }

            sourceAccount.balance -= amount
            destinationAccount.balance += amount

            await sourceAccount.save({ transaction: t })
            await destinationAccount.save({ transaction: t })

            const transfer = await BankTransfer.create(
                { sourceAccountId, destinationAccountId, amount, date },
                { transaction: t },
            )

            await t.commit()

            reply.send(transfer)
        } catch (error) {
            await t.rollback()
            reply.status(500).send(error)
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
