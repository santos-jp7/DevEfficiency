import { FastifyRequest, FastifyReply } from 'fastify'

import Client from '../models/Client'
import Protocol from '../models/Protocol'
import { computeServicePricing, getClientByProtocol, getHourlyRate, partnerPercentOf } from '../utils/pricing'

type pricingPreviewRequest = FastifyRequest<{
    Querystring: { clientId?: string; protocolId?: string; hours?: string; hourly_rate?: string }
}>

class pricingController {
    // Cálculo ao vivo para o front: o resultado oficial é sempre recalculado no servidor ao gravar o item.
    static async preview(req: pricingPreviewRequest, res: FastifyReply): Promise<FastifyReply> {
        const { clientId, protocolId, hours, hourly_rate } = req.query

        const h = Number(hours)
        if (!(h > 0)) return res.status(400).send({ message: 'Informe horas maiores que zero.' })

        let client: Client | null = null
        if (clientId) client = await Client.findByPk(clientId)
        else if (protocolId) {
            const protocol = await Protocol.findByPk(protocolId)
            client = protocol ? await getClientByProtocol(protocol) : null
        }

        const rate = hourly_rate ? Number(hourly_rate) : await getHourlyRate()
        if (!(rate > 0)) return res.status(400).send({ message: 'Valor hora inválido.' })

        const pricing = computeServicePricing(h, rate, partnerPercentOf(client))

        return res.send({
            hourly_rate: pricing.hourly_rate,
            gross: pricing.gross_value,
            discount_percent: pricing.partner_discount_percent ?? 0,
            discount_value: pricing.partner_discount_value,
            net: pricing.value,
            is_partner: !!client?.is_partner,
        })
    }
}

export default pricingController
