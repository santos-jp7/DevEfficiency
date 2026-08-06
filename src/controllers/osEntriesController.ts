import { FastifyRequest, FastifyReply } from 'fastify'
import Os_entry from '../models/Os_entry'
import Service_order from '../models/Service_order'
import Project from '../models/Project'
import Client from '../models/Client'

type OsEntryRequest = FastifyRequest<{
    Body: any
    Params: { id: string }
    Querystring: { serviceOrderId: string; status: string }
}>

class osEntriesController {
    static async index(req: OsEntryRequest, res: FastifyReply): Promise<FastifyReply> {
        const { serviceOrderId, status } = req.query
        const where: any = {}
        if (serviceOrderId) where.ServiceOrderId = parseInt(serviceOrderId)
        if (status) where.status = status

        const entries = await Os_entry.findAll({
            where,
            order: [['date', 'DESC']],
            include: [{ model: Service_order, include: [{ model: Project, include: [Client] }] }],
        })
        return res.send(entries)
    }

    static async show(req: OsEntryRequest, res: FastifyReply): Promise<FastifyReply> {
        const entry = await Os_entry.findByPk(req.params.id)
        if (!entry) return res.status(404).send({ message: 'Apontamento não encontrado' })
        return res.send(entry)
    }

    static async create(req: OsEntryRequest, res: FastifyReply): Promise<FastifyReply> {
        const { description, public: isPublic, date, status, ServiceOrderId } = req.body as any

        const os = await Service_order.findByPk(ServiceOrderId)
        if (!os) return res.status(404).send({ message: 'Ordem de serviço não encontrada' })

        const entry = await Os_entry.create({ description, public: isPublic, date, status, ServiceOrderId })
        return res.status(201).send(entry)
    }

    static async update(req: OsEntryRequest, res: FastifyReply): Promise<FastifyReply> {
        const entry = await Os_entry.findByPk(req.params.id)
        if (!entry) return res.status(404).send({ message: 'Apontamento não encontrado' })

        const { description, public: isPublic, date, status } = req.body as any
        await entry.update({ description, public: isPublic, date, status })
        return res.send(entry)
    }

    static async destroy(req: OsEntryRequest, res: FastifyReply): Promise<FastifyReply> {
        const entry = await Os_entry.findByPk(req.params.id)
        if (!entry) return res.status(404).send({ message: 'Apontamento não encontrado' })

        await entry.destroy()
        return res.status(204).send()
    }
}

export default osEntriesController
