import { FastifyRequest, FastifyReply } from 'fastify'
import ClientSlaConfig from '../models/ClientSlaConfig'

type configRequest = FastifyRequest<{
    Body: { gravidade: string; response_hours: number; solution_hours: number }
    Params: { id: string; configId: string }
}>

class clientSlaConfigController {
    static async index(req: configRequest, res: FastifyReply) {
        const { id } = req.params
        return res.send(await ClientSlaConfig.findAll({ where: { ClientId: id }, order: [['gravidade', 'ASC']] }))
    }

    static async store(req: configRequest, res: FastifyReply) {
        const { id } = req.params
        const { gravidade, response_hours, solution_hours } = req.body
        const existing = await ClientSlaConfig.findOne({ where: { ClientId: id, gravidade } })
        if (existing) {
            await existing.update({ response_hours, solution_hours })
            return res.send(existing)
        }
        return res.send(
            await ClientSlaConfig.create({
                ClientId: parseInt(id),
                gravidade: gravidade as any,
                response_hours,
                solution_hours,
            }),
        )
    }

    static async destroy(req: configRequest, res: FastifyReply) {
        const { configId } = req.params
        const config = await ClientSlaConfig.findByPk(configId)
        await config?.destroy()
        return res.send({ ok: true })
    }
}

export default clientSlaConfigController
