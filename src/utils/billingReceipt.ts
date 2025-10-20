import { FastifyRequest, FastifyReply } from 'fastify'

import db from '../db'

import Billing from '../models/Billing'
import BillingProtocol from '../models/BillingProtocol'
import Protocol from '../models/Protocol'
import Protocol_register from '../models/Protocol_register'
import Protocol_product from '../models/Protocol_product'

export default async function billingReceipt(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
    const { id } = req.body as { id: string }

    let trx = await db.transaction()

    try {
        const billing = await Billing.findByPk(id, {
            include: [
                {
                    model: BillingProtocol,
                    include: [Protocol],
                },
            ],
        })

        if (!billing) {
            await trx.rollback()
            return res.status(404).send({ error: true, message: 'Cobrança não encontrada' })
        }

        if (billing.status === 'pago') {
            await trx.rollback()
            return res.status(400).send({ error: true, message: 'Cobrança já está paga' })
        }

        if (!billing.BillingProtocols || billing.BillingProtocols.length === 0) {
            await trx.rollback()
            return res.status(400).send({ error: true, message: 'Nenhum protocolo associado a esta cobrança' })
        }

        for (const billingProtocol of billing.BillingProtocols) {
            if (!billingProtocol.Protocol) {
                await trx.rollback()
                return res.status(400).send({ error: true, message: 'Protocolo associado à cobrança não encontrado' })
            }

            await billingProtocol.Protocol.createReceipt(
                {
                    method: billing.method,
                    value: billingProtocol.value,
                    note: `Recebido via cobrança #${billing.id}`,
                },
                { transaction: trx },
            )
        }

        await billing.update({ status: 'pago', payment_date: new Date() }, { transaction: trx })

        await trx.commit()

        return res.send({ error: false })
    } catch (err) {
        await trx.rollback()
        console.error(err)
        return res.status(500).send({ error: true, message: 'Erro ao processar recebimentos' })
    }
}
