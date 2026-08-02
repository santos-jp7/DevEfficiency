import { FastifyRequest, FastifyReply } from 'fastify'
import Reimbursement from '../models/Reimbursement'
import ReimbursementFile from '../models/ReimbursementFile'
import BankAccount from '../models/BankAccount'
import Supplier from '../models/Supplier'
import User from '../models/User'
import db from '../db'
import CloudFlareR2 from '../providers/CloudFlareR2'

class ReimbursementsController {
    static async store(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        const t = await db.transaction()
        try {
            const { description, value, PayableId, BankAccountId, SupplierId } = req.body as any
            const UserId = (req as any).user?.id

            const bankAccount = await BankAccount.findByPk(BankAccountId, { transaction: t })
            if (!bankAccount) {
                await t.rollback()
                return res.status(404).send({ error: 'Conta bancária não encontrada' })
            }

            const reimbursement = await Reimbursement.create(
                { description, value, PayableId, BankAccountId, SupplierId, UserId },
                { transaction: t },
            )

            await bankAccount.increment('balance', { by: Number(value), transaction: t })

            await t.commit()
            return res.status(201).send(reimbursement)
        } catch (error) {
            await t.rollback()
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async show(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { id } = req.params
            const reimbursement = await Reimbursement.findByPk(id, {
                include: [Supplier, BankAccount, User, ReimbursementFile],
            })

            if (!reimbursement) {
                return res.status(404).send({ error: 'Ressarcimento não encontrado' })
            }

            return res.send(reimbursement)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async upload(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params

        const reimbursement = await Reimbursement.findByPk(id)
        if (!reimbursement) {
            return res.status(404).send({ error: 'Ressarcimento não encontrado' })
        }

        const data = await req.file()
        if (!data) {
            return res.status(400).send({ error: 'Arquivo não enviado' })
        }

        const chunks: Buffer[] = []
        for await (const chunk of data.file) {
            chunks.push(chunk)
        }
        const buffer = Buffer.concat(chunks)

        const key = `reimbursements/${id}/${Date.now()}_${data.filename}`
        const url = await CloudFlareR2.uploadFile(key, buffer, data.mimetype)

        const file = await ReimbursementFile.create({
            ReimbursementId: parseInt(id),
            filename: data.filename,
            url,
        })

        return res.status(201).send(file)
    }

    static async destroy(req: FastifyRequest<{ Params: { id: string } }>, res: FastifyReply): Promise<FastifyReply> {
        const t = await db.transaction()
        try {
            const { id } = req.params
            const reimbursement = await Reimbursement.findByPk(id, { transaction: t })

            if (!reimbursement) {
                await t.rollback()
                return res.status(404).send({ error: 'Ressarcimento não encontrado' })
            }

            const bankAccount = await BankAccount.findByPk(reimbursement.BankAccountId, { transaction: t })
            if (bankAccount) {
                await bankAccount.decrement('balance', { by: Number(reimbursement.value), transaction: t })
            }

            await reimbursement.destroy({ transaction: t })

            await t.commit()
            return res.status(204).send()
        } catch (error) {
            await t.rollback()
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }
}

export default ReimbursementsController
