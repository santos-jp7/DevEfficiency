import { FastifyRequest, FastifyReply } from 'fastify'

import Project from '../models/Project'
import Protocol from '../models/Protocol'
import Service_order from '../models/Service_order'

type serviceOrdersRequest = FastifyRequest<{
    Body: Service_order
    Params: Service_order
    Headers: any
}>

class serviceOrdersController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Service_order.findAll())
    }

    static async show(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Service_order.findByPk(req.params.id, { include: [Protocol] }))
    }

    static async store(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        const { subject, description, status, projectId } = req.body

        const project = await Project.findByPk(projectId)
        const os = await project?.createService_order({ subject, description, status })

        await os?.createProtocol()

        return res.send(os)
    }

    static async update(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { description, subject, status } = req.body

        const os = await Service_order.findByPk(id)

        await os?.update({ description, subject, status })
        await os?.save()

        return res.send(os)
    }
}

export default serviceOrdersController
