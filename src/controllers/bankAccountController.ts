import { FastifyRequest, FastifyReply } from 'fastify'
import BankAccount from '../models/BankAccount'

// Define a type for the request to ensure type safety
type BankAccountRequest = FastifyRequest<{
    Body: BankAccount
    Params: BankAccount
    Headers: any
}>

class BankAccountController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const bankAccounts = await BankAccount.findAll()
            return res.send(bankAccounts)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async show(req: BankAccountRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { id } = req.params
            const bankAccount = await BankAccount.findByPk(id)

            if (!bankAccount) {
                return res.status(404).send({ error: 'Bank account not found' })
            }

            return res.send(bankAccount)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async store(req: BankAccountRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { name, bank, agency, accountNumber, balance } = req.body
            const newBankAccount = await BankAccount.create({ name, bank, agency, accountNumber, balance })
            return res.status(201).send(newBankAccount)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async update(req: BankAccountRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { id } = req.params
            const { name, bank, agency, accountNumber, balance } = req.body

            const bankAccount = await BankAccount.findByPk(id)

            if (!bankAccount) {
                return res.status(404).send({ error: 'Bank account not found' })
            }

            // Prevent balance from being updated directly via this endpoint for safety
            await bankAccount.update({ name, bank, agency, accountNumber })

            return res.send(bankAccount)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async destroy(req: BankAccountRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { id } = req.params
            const bankAccount = await BankAccount.findByPk(id)

            if (!bankAccount) {
                return res.status(404).send({ error: 'Bank account not found' })
            }

            await bankAccount.destroy()

            return res.status(204).send()
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }
}

export default BankAccountController
