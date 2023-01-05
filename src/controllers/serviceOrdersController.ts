import { FastifyRequest, FastifyReply } from 'fastify'

import Project from '../models/Project'
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
        return res.send(await Service_order.findByPk(req.params.id))
    }

    static async store(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        const { subject, description, status, projectId } = req.body

        const project = await Project.findByPk(projectId)
        const os = await project?.createService_order({ subject, description, status })

        return res.send(os)
    }

    static async update(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }

    static async destroy(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }
}

export default serviceOrdersController
