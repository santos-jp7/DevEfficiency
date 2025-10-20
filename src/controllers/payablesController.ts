import { FastifyRequest, FastifyReply } from 'fastify'
import Payable from '../models/Payable'
import Supplier from '../models/Supplier'
import BankAccount from '../models/BankAccount'
import CostCenter from '../models/CostCenter'
import db from '../db'

// Define a type for the request to ensure type safety
type PayableRequest = FastifyRequest<{
    Body: Payable
    Params: Payable
    Headers: any
}>

class PayablesController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const payables = await Payable.findAll({
                include: [Supplier, BankAccount, CostCenter],
            })
            return res.send(payables)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async show(req: PayableRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { id } = req.params
            const payable = await Payable.findByPk(id, {
                include: [Supplier, BankAccount, CostCenter],
            })

            if (!payable) {
                return res.status(404).send({ error: 'Payable not found' })
            }

            return res.send(payable)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async store(req: PayableRequest, res: FastifyReply): Promise<FastifyReply> {
        const t = await db.transaction()
        try {
            const newPayable = await Payable.create(req.body, { transaction: t })
            await t.commit()
            return res.status(201).send(newPayable)
        } catch (error) {
            await t.rollback()
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async update(req: PayableRequest, res: FastifyReply): Promise<FastifyReply> {
        const t = await db.transaction()
        try {
            const { id } = req.params
            const payable = await Payable.findByPk(id, { transaction: t })

            if (!payable) {
                await t.rollback()
                return res.status(404).send({ error: 'Payable not found' })
            }

            await payable.update(req.body, { transaction: t })

            await t.commit()
            return res.send(payable)
        } catch (error) {
            await t.rollback()
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async destroy(req: PayableRequest, res: FastifyReply): Promise<FastifyReply> {
        const t = await db.transaction()
        try {
            const { id } = req.params
            const payable = await Payable.findByPk(id, { transaction: t })

            if (!payable) {
                await t.rollback()
                return res.status(404).send({ error: 'Payable not found' })
            }

            await payable.destroy({ transaction: t })

            await t.commit()
            return res.status(204).send()
        } catch (error) {
            await t.rollback()
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }
}

export default PayablesController
