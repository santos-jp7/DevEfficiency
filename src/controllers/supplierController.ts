import { FastifyRequest, FastifyReply } from 'fastify'
import Supplier from '../models/Supplier'
import { PaymentTermsError, normalizeTerms } from '../utils/paymentTerms'

// Define a type for the request to ensure type safety
type SupplierRequest = FastifyRequest<{
    Body: Supplier
    Params: Supplier
    Headers: any
}>

class SupplierController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const suppliers = await Supplier.findAll()
            return res.send(suppliers)
        } catch (error) {
            if (error instanceof PaymentTermsError) return res.status(400).send({ error: error.message, message: error.message })
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async show(req: SupplierRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { id } = req.params
            const supplier = await Supplier.findByPk(id)

            if (!supplier) {
                return res.status(404).send({ error: 'Supplier not found' })
            }

            return res.send(supplier)
        } catch (error) {
            if (error instanceof PaymentTermsError) return res.status(400).send({ error: error.message, message: error.message })
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async store(req: SupplierRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { name, cnpj, email, phone, default_commission_percent, commission_payment_days, default_payment_terms } = req.body as any
            const newSupplier = await Supplier.create({
                name,
                cnpj,
                email,
                phone,
                default_commission_percent: default_commission_percent === '' ? null : default_commission_percent ?? null,
                commission_payment_days: commission_payment_days === '' || commission_payment_days == null ? 30 : commission_payment_days,
                default_payment_terms: normalizeTerms(default_payment_terms),
            })
            return res.status(201).send(newSupplier)
        } catch (error) {
            if (error instanceof PaymentTermsError) return res.status(400).send({ error: error.message, message: error.message })
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async update(req: SupplierRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { id } = req.params
            const { name, cnpj, email, phone, default_commission_percent, commission_payment_days, default_payment_terms } = req.body as any

            const supplier = await Supplier.findByPk(id)

            if (!supplier) {
                return res.status(404).send({ error: 'Supplier not found' })
            }

            await supplier.update({
                name,
                cnpj,
                email,
                phone,
                ...(default_commission_percent !== undefined
                    ? { default_commission_percent: default_commission_percent === '' ? null : default_commission_percent }
                    : {}),
                ...(commission_payment_days !== undefined && commission_payment_days !== ''
                    ? { commission_payment_days }
                    : {}),
                ...(default_payment_terms !== undefined ? { default_payment_terms: normalizeTerms(default_payment_terms) } : {}),
            })

            return res.send(supplier)
        } catch (error) {
            if (error instanceof PaymentTermsError) return res.status(400).send({ error: error.message, message: error.message })
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async destroy(req: SupplierRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { id } = req.params
            const supplier = await Supplier.findByPk(id)

            if (!supplier) {
                return res.status(404).send({ error: 'Supplier not found' })
            }

            await supplier.destroy()

            return res.status(204).send()
        } catch (error) {
            if (error instanceof PaymentTermsError) return res.status(400).send({ error: error.message, message: error.message })
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }
}

export default SupplierController
