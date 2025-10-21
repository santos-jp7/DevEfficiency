import { FastifyRequest, FastifyReply } from 'fastify'
import CostCenter from '../models/CostCenter'

// Define a type for the request to ensure type safety
type CostCenterRequest = FastifyRequest<{
    Body: CostCenter
    Params: CostCenter
    Headers: any
}>

class CostCenterController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const costCenters = await CostCenter.findAll({
                include: [
                    {
                        model: CostCenter,
                        as: 'children',
                        include: [
                            {
                                model: CostCenter,
                                as: 'children',
                                include: [
                                    {
                                        model: CostCenter,
                                        as: 'children',
                                        include: [
                                            {
                                                model: CostCenter,
                                                as: 'children',
                                                include: [
                                                    {
                                                        model: CostCenter,
                                                        as: 'children',
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
                where: { ParentId: null }, // Start from root nodes
            })
            return res.send(costCenters)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async show(req: CostCenterRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { id } = req.params
            const costCenter = await CostCenter.findByPk(id, {
                include: [
                    { model: CostCenter, as: 'parent' },
                    { model: CostCenter, as: 'children' },
                ],
            })

            if (!costCenter) {
                return res.status(404).send({ error: 'Cost center not found' })
            }

            return res.send(costCenter)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async store(req: CostCenterRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { name, description, ParentId } = req.body
            const newCostCenter = await CostCenter.create({ name, description, ParentId })
            return res.status(201).send(newCostCenter)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async update(req: CostCenterRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { id } = req.params
            const { name, description, ParentId } = req.body

            const costCenter = await CostCenter.findByPk(id)

            if (!costCenter) {
                return res.status(404).send({ error: 'Cost center not found' })
            }

            await costCenter.update({ name, description, ParentId })

            return res.send(costCenter)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }

    static async destroy(req: CostCenterRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { id } = req.params
            const costCenter = await CostCenter.findByPk(id)

            if (!costCenter) {
                return res.status(404).send({ error: 'Cost center not found' })
            }

            await costCenter.destroy()

            return res.status(204).send()
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }
}

export default CostCenterController
