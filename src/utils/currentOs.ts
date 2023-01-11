import { FastifyRequest, FastifyReply } from 'fastify'
import Client from '../models/Client'
import Project from '../models/Project'

import Service_order from '../models/Service_order'

export default async function currentOs(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
    return res.send(
        await Service_order.findOne({
            where: { status: 'Em correções' },
            include: [{ model: Project, include: [Client] }],
        }),
    )
}
