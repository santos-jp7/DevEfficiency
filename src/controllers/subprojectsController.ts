import { FastifyRequest, FastifyReply } from 'fastify'

import Project from '../models/Project'
import Subproject from '../models/Subproject'

type subprojectsRequest = FastifyRequest<{
    Body: Subproject
    Params: Subproject
    Headers: any
}>

class subprojectsController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Subproject.findAll())
    }

    static async show(req: subprojectsRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Subproject.findByPk(req.params.id))
    }

    static async store(req: subprojectsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { name, url, projectId, type } = req.body

        const project = await Project.findByPk(projectId)
        const subproject = await project?.createSubproject({ name, url, type })

        return res.send(subproject)
    }

    static async update(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }

    static async destroy(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send('Hello World')
    }
}

export default subprojectsController
