import { FastifyRequest, FastifyReply } from 'fastify'

import Protocol_register from '../models/Protocol_register'
import Protocol from '../models/Protocol'
import { computeServicePricing, getClientByProtocol, getHourlyRate, partnerPercentOf, round2 } from '../utils/pricing'

type protocolsRegisterRequest = FastifyRequest<{
    Body: Protocol_register
    Params: Protocol_register
    Headers: any
}>

type RegisterPayload = Pick<Protocol_register, 'description' | 'value' | 'type'> &
    Partial<Pick<Protocol_register, 'estimated_hours' | 'hourly_rate' | 'manual_override'>>

export class PricingError extends Error {}

// Monta os campos persistidos do item. Itens de Serviço com horas são calculados aqui, no servidor;
// Despesa (ou Serviço sem horas, formato legado) segue com description + value, sem desconto.
export async function buildRegisterData(
    protocol: Protocol,
    body: RegisterPayload,
    current?: Protocol_register | null,
): Promise<Partial<Protocol_register>> {
    const { description, type } = body

    if (type !== 'Serviço') {
        return {
            description,
            type,
            value: body.value,
            estimated_hours: null,
            hourly_rate: null,
            gross_value: null,
            partner_discount_percent: null,
            partner_discount_value: null,
            manual_override: false,
        }
    }

    const hasHours = body.estimated_hours !== undefined && body.estimated_hours !== null
    const hours = Number(body.estimated_hours)

    if (!hasHours) {
        // Serviço sem horas: se o item já era precificado e o valor foi editado, vira ajuste manual.
        if (current?.estimated_hours != null) {
            return {
                description,
                type,
                ...(body.value !== undefined && round2(body.value) !== round2(current.value)
                    ? { value: round2(body.value), manual_override: true }
                    : {}),
            }
        }

        return { description, type, value: body.value }
    }

    if (!(hours > 0)) throw new PricingError('Horas estimadas devem ser maiores que zero.')

    const override = body.hourly_rate !== undefined && body.hourly_rate !== null && body.hourly_rate !== ('' as any)
    const hourlyRate = override
        ? Number(body.hourly_rate)
        : current?.hourly_rate != null
        ? current.hourly_rate
        : await getHourlyRate()

    if (!(hourlyRate > 0)) throw new PricingError('Valor hora deve ser maior que zero.')

    // Snapshot: item já precificado mantém o % de quando foi lançado; item novo usa o % atual do cliente.
    const partnerPercent =
        current?.estimated_hours != null
            ? Number(current.partner_discount_percent) || 0
            : partnerPercentOf(await getClientByProtocol(protocol))

    const pricing = computeServicePricing(hours, hourlyRate, partnerPercent)

    // Ajuste manual excepcional do valor final: preserva bruto e desconto calculados, muda só o valor final.
    const manual = body.manual_override === true && body.value !== undefined && body.value !== null

    return {
        description,
        type,
        ...pricing,
        value: manual ? round2(body.value) : pricing.value,
        manual_override: manual,
    }
}

function assertEditable(protocol: Protocol) {
    if (['Fechado', 'Cancelado'].includes(protocol.status))
        throw new PricingError('Protocolo fechado ou cancelado não pode ter valores recalculados.')
}

class protocolsRegisterController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Protocol_register.findAll())
    }

    static async show(req: protocolsRegisterRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Protocol_register.findByPk(req.params.id))
    }

    static async store(req: protocolsRegisterRequest, res: FastifyReply): Promise<FastifyReply> {
        const { ProtocolId } = req.body

        const protocol = await Protocol.findByPk(ProtocolId)
        if (!protocol) return res.status(404).send({ message: 'Protocolo não encontrado.' })

        try {
            const data = await buildRegisterData(protocol, req.body)
            const protocol_register = await protocol.createProtocol_register(data as any)

            return res.send(protocol_register)
        } catch (e) {
            if (e instanceof PricingError) return res.status(400).send({ message: e.message })
            throw e
        }
    }

    static async update(req: protocolsRegisterRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params

        const protocol_register = await Protocol_register.findByPk(id)
        if (!protocol_register) return res.status(404).send({ message: 'Registro não encontrado.' })

        const protocol = await Protocol.findByPk(protocol_register.ProtocolId)
        if (!protocol) return res.status(404).send({ message: 'Protocolo não encontrado.' })

        try {
            // Itens precificados ficam imutáveis quando o protocolo já foi fechado/cancelado.
            if (protocol_register.estimated_hours != null) assertEditable(protocol)

            const data = await buildRegisterData(protocol, req.body, protocol_register)
            await protocol_register.update(data)

            return res.send(protocol_register)
        } catch (e) {
            if (e instanceof PricingError) return res.status(400).send({ message: e.message })
            throw e
        }
    }

    static async destroy(req: protocolsRegisterRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params

        const protocol_register = await Protocol_register.findByPk(id)
        await protocol_register?.destroy()

        return res.status(204).send()
    }
}

export default protocolsRegisterController
