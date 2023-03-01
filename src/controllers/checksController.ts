import { FastifyRequest, FastifyReply } from 'fastify'

import Project from '../models/Project'
import Check from '../models/Check'

type checksRequest = FastifyRequest<{
    Body: Check
    Params: Check
    Headers: any
}>

class checksController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Check.findAll())
    }

    static async show(req: checksRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Check.findByPk(req.params.id))
    }

    static async store(req: checksRequest, res: FastifyReply): Promise<FastifyReply> {
        const { description, url, condition, send_alert, verify_status, message, path_return, ProjectId } = req.body

        const project = await Project.findByPk(ProjectId)
        const check = await project?.createCheck({
            description,
            url,
            condition,
            send_alert,
            verify_status,
            message,
            path_return,
        })

        return res.send(check)
    }

    static async update(req: checksRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { description, url, condition, send_alert, verify_status, message, path_return } = req.body

        const check = await Check.findByPk(id)

        await check?.update({ description, url, condition, send_alert, verify_status, message, path_return })
        await check?.save()

        return res.send(check)
    }

    static async destroy(req: checksRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params

        const check = await Check.findByPk(id)
        await check?.destroy()

        return res.status(204).send()
    }
}

export default checksController
