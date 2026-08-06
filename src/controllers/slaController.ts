import { FastifyRequest, FastifyReply } from 'fastify'
import SlaLevel from '../models/SlaLevel'

class slaController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        const levels = await SlaLevel.findAll({ where: { active: true }, order: [['id', 'ASC']] })
        return res.send(levels)
    }

    static async store(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        const { name, category, response_hours, solution_hours } = req.body as any
        const level = await SlaLevel.create({ name, category, response_hours, solution_hours })
        return res.status(201).send(level)
    }

    static async update(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params as any
        const { name, category, response_hours, solution_hours, active } = req.body as any
        const level = await SlaLevel.findByPk(id)
        if (!level) return res.status(404).send({ message: 'Nível SLA não encontrado' })
        await level.update({ name, category, response_hours, solution_hours, active })
        return res.send(level)
    }

    static async destroy(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params as any
        const level = await SlaLevel.findByPk(id)
        if (!level) return res.status(404).send({ message: 'Nível SLA não encontrado' })
        await level.destroy()
        return res.send({ message: 'Removido' })
    }
}

export default slaController
