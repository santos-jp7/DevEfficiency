import { FastifyRequest, FastifyReply } from 'fastify'
import { Op, fn, col, literal, where } from 'sequelize'
import Payable from '../models/Payable'
import CostCenter from '../models/CostCenter'

interface CostCenterNode {
    id: number
    name: string
    total: number
    children: CostCenterNode[]
}

type ReportRequest = FastifyRequest<{
    Querystring: { startDate?: string; endDate?: string }
    Params: any
    Body: any
    Headers: any
}>

class ExpenseReportController {
    static async index(req: ReportRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { startDate, endDate } = req.query
            const dateFilter: any = {}

            if (startDate && endDate) {
                dateFilter[Op.between] = [new Date(startDate), new Date(endDate)]
            }

            // 1. Get totals for each Cost Center that has expenses
            const expenseTotalsByCC = await Payable.findAll({
                attributes: ['CostCenterId', [fn('SUM', col('value')), 'totalValue']],
                where: {
                    status: 'pago',
                    ...(startDate && endDate && { paymentDate: dateFilter }),
                    [Op.and]: [where(col('CostCenterId'), Op.ne, null)],
                },
                group: ['CostCenterId'],
                raw: true,
            })

            const totalsMap = new Map<number, number>()
            expenseTotalsByCC.forEach((item: any) => {
                totalsMap.set(item.CostCenterId, parseFloat(item.totalValue))
            })

            // 2. Get all cost centers and build the tree
            const allCostCenters = await CostCenter.findAll()
            const nodesById = new Map<number, CostCenterNode>()
            const rootNodes: CostCenterNode[] = []

            // Initialize all nodes
            allCostCenters.forEach((cc) => {
                nodesById.set(cc.id, {
                    id: cc.id,
                    name: cc.name,
                    total: totalsMap.get(cc.id) || 0, // Direct expenses
                    children: [],
                })
            })

            // Link children to parents
            allCostCenters.forEach((cc) => {
                if (cc.ParentId && nodesById.has(cc.ParentId)) {
                    const parentNode = nodesById.get(cc.ParentId)!
                    const childNode = nodesById.get(cc.id)!
                    parentNode.children.push(childNode)
                } else {
                    rootNodes.push(nodesById.get(cc.id)!)
                }
            })

            // 3. Roll up totals from children to parents
            const calculateRollupTotal = (node: CostCenterNode): number => {
                if (node.children.length === 0) {
                    return node.total
                }
                const childrenTotal = node.children.reduce((sum, child) => sum + calculateRollupTotal(child), 0)
                node.total += childrenTotal
                return node.total
            }

            rootNodes.forEach(calculateRollupTotal)

            return res.send(rootNodes)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }
}

export default ExpenseReportController
