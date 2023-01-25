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
        const { name, url, ProjectId, type } = req.body

        const project = await Project.findByPk(ProjectId)
        const subproject = await project?.createSubproject({ name, url, type })

        return res.send(subproject)
    }

    static async update(req: subprojectsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { name, url, type } = req.body

        const subproject = await Subproject.findByPk(id)

        await subproject?.update({
            name,
            url,
            type,
        })
        await subproject?.save()

        return res.send(subproject)
    }

    static async destroy(req: subprojectsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params

        const subproject = await Subproject.findByPk(id)
        await subproject?.destroy()

        return res.status(204).send()
    }
}

export default subprojectsController
