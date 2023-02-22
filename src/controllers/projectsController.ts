import { FastifyRequest, FastifyReply } from 'fastify'

import Client from '../models/Client'
import Project from '../models/Project'
import Service_order from '../models/Service_order'
import Subproject from '../models/Subproject'

type projectsRequest = FastifyRequest<{
    Body: Project
    Params: Project
    Querystring: {
        filter: 'fixed'
    }
    Headers: any
}>

class projectsController {
    static async index(req: projectsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { filter } = req.query

        let where

        if (filter == 'fixed') {
            where = {
                fixed: true,
            }
        }

        return res.send(await Project.findAll({ where, include: [Client] }))
    }

    static async show(req: projectsRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(
            await Project.findByPk(req.params.id, {
                include: [Subproject, Service_order, Client],
            }),
        )
    }

    static async store(req: projectsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { name, url, ClientId, type, ServerId } = req.body

        const client = await Client.findByPk(ClientId)
        const project = await client?.createProject({ name, url, type, ServerId })

        return res.send(project)
    }

    static async update(req: projectsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { name, url, type, fixed, ServerId } = req.body

        const project = await Project.findByPk(id)

        await project?.update({ name, url, type, fixed, ServerId })
        await project?.save()

        return res.send(project)
    }
}

export default projectsController
