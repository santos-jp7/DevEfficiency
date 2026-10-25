import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'
import Payable from '../models/Payable'
import Supplier from '../models/Supplier'
import BankAccount from '../models/BankAccount'
import CostCenter from '../models/CostCenter'
import Reimbursement from '../models/Reimbursement'
import ReimbursementFile from '../models/ReimbursementFile'
import User from '../models/User'
import Seller from '../models/Seller'
import db from '../db'
import { alreadyMatched, reconcileTarget, releaseTarget } from '../utils/reconciliation'

// Define a type for the request to ensure type safety
type PayableRequest = FastifyRequest<{
    Body: Payable
    Params: Payable
    Headers: any
}>

class PayablesController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { startDate, endDate, supplier } = req.query as any

            const where: any = {}
            if (startDate || endDate) {
                where.dueDate = {}
                if (startDate) where.dueDate[Op.gte] = startDate
                if (endDate) where.dueDate[Op.lte] = endDate
            }

            const { costCenter } = req.query as any

            const supplierInclude: any = { model: Supplier }
            if (supplier) {
                supplierInclude.where = { name: { [Op.like]: `%${supplier}%` } }
                supplierInclude.required = true
            }

            const costCenterInclude: any = { model: CostCenter }
            if (costCenter) {
                costCenterInclude.where = { name: { [Op.like]: `%${costCenter}%` } }
                costCenterInclude.required = true
            }

            const payables = await Payable.findAll({
                where,
                include: [supplierInclude, BankAccount, costCenterInclude, Seller, { model: Reimbursement, attributes: ['id', 'value'] }],
                order: [['dueDate', 'DESC']],
            })

            // Pagas: indica se já foram encontradas no extrato bancário.
            const reconciled = await alreadyMatched('payable', payables.filter((p) => p.status === 'pago').map((p) => p.id))

            return res.send(payables.map((p) => ({ ...p.toJSON(), reconciled: reconciled.has(p.id) })))
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async show(req: PayableRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { id } = req.params
            const payable = await Payable.findByPk(id, {
                include: [Supplier, BankAccount, CostCenter, Seller, {
                    model: Reimbursement,
                    include: [Supplier, BankAccount, { model: User, attributes: ['id', 'username'] }, ReimbursementFile],
                }],
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
            if (newPayable.status === 'pago') await reconcileTarget('payable', newPayable.id)
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

            // Marcar como pago (ou alterar valor/conta/data) reavalia a conciliação com o extrato.
            await releaseTarget('payable', payable.id)
            if (payable.status === 'pago') await reconcileTarget('payable', payable.id)

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
            await releaseTarget('payable', payable.id)
            return res.status(204).send()
        } catch (error) {
            await t.rollback()
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }
}

export default PayablesController
