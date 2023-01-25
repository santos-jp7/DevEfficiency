import { FastifyRequest, FastifyReply } from 'fastify'
import Client from '../models/Client'

import Project from '../models/Project'
import Protocol from '../models/Protocol'
import Protocol_register from '../models/Protocol_register'
import Receipts from '../models/Receipts'
import Service_order from '../models/Service_order'

type serviceOrdersRequest = FastifyRequest<{
    Body: Service_order
    Params: Service_order
    Querystring: {
        filter: 'last_three' | 'pending'
    }
    Headers: any
}>

class serviceOrdersController {
    static async index(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        const { filter } = req.query

        let limit

        if (filter == 'last_three') {
            limit = 3
        }

        return res.send(
            await Service_order.findAll({
                order: [['createdAt', 'DESC']],
                limit,
                include: [{ model: Project, include: [Client] }],
            }),
        )
    }

    static async show(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Service_order.findByPk(req.params.id, { include: [Protocol] }))
    }

    static async store(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        const { subject, description, ProjectId } = req.body

        const project = await Project.findByPk(ProjectId)
        const os = await project?.createService_order({ subject, description })

        await os?.createProtocol()

        return res.send(os)
    }

    static async update(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { description, subject, status } = req.body

        const os = await Service_order.findByPk(id)
        const protocol = await os?.getProtocol()

        if (status == 'Em correções') {
            const current_os = await Service_order.findOne({ where: { status: 'Em correções' } })

            if (current_os) throw new Error(`Já possuimos uma Os em correções (Os #${current_os.id}).`)
        }

        if (status == 'Finalizado') {
            const total_cost =
                ((await protocol?.getProtocol_registers())?.reduce((sum, v) => sum + v.value, 0) || 0) +
                ((await protocol?.getProtocol_products())?.reduce((sum, v) => sum + v.value, 0) || 0)

            const total_receipt = (await protocol?.getReceipts())?.reduce((sum, v) => sum + v.value, 0) || 0

            if (total_receipt < total_cost)
                throw new Error('Não é possivel finalizar, protocolo com recebimentos pendentes.')

            await protocol?.update({ status: 'Fechado' })
            await protocol?.save()
        }

        await os?.update({ description, subject, status })
        await os?.save()

        return res.send(os)
    }
}

export default serviceOrdersController
