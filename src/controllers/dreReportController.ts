import { FastifyRequest, FastifyReply } from 'fastify'
import { Op, fn, col, where } from 'sequelize'
import moment from 'moment'

import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'
import Protocol_register from '../models/Protocol_register'
import Receipts from '../models/Receipts'
import Product from '../models/Product'
import Payable from '../models/Payable'
import CostCenter from '../models/CostCenter'

type DREVolumes = {
    revenue: number
    directCosts: {
        productCosts: number
        serviceExpenses: number
    }
    operatingExpenses: {
        total: number
        byCostCenter: { name: string; value: number }[]
    }
    grossProfit: number
    netResult: number
}

class DreReportController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const { month, year } = req.query as { month?: string; year?: string }
            
            const startDate = moment().year(parseInt(year || moment().year().toString())).month(parseInt(month || moment().month().toString()) - 1).startOf('month').toDate()
            const endDate = moment(startDate).endOf('month').toDate()

            // 1. Revenue: Total from Receipts where Protocol.closedAt is in period
            const receipts = await Receipts.findAll({
                include: [{
                    model: Protocol,
                    where: {
                        closedAt: { [Op.between]: [startDate, endDate] },
                        status: 'Fechado'
                    },
                    required: true
                }]
            })
            const totalRevenue = receipts.reduce((sum, r) => sum + parseFloat(r.value.toString()), 0)

            // 2. Direct Costs (CPV)
            // 2a. Product Costs (from Protocols closed in period)
            const protocolProducts = await Protocol_product.findAll({
                include: [
                    {
                        model: Protocol,
                        where: {
                            closedAt: { [Op.between]: [startDate, endDate] },
                            status: 'Fechado'
                        },
                        required: true
                    },
                    { model: Product, required: true }
                ]
            })
            const totalProductCosts = protocolProducts.reduce((sum, pp) => sum + (pp as any).Product.coust, 0)

            // 2b. Service Expenses (Protocol_register where type = 'Despesa')
            const serviceExpenses = await Protocol_register.findAll({
                where: { type: 'Despesa' },
                include: [{
                    model: Protocol,
                    where: {
                        closedAt: { [Op.between]: [startDate, endDate] },
                        status: 'Fechado'
                    },
                    required: true
                }]
            })
            const totalServiceExpenses = serviceExpenses.reduce((sum, se) => sum + parseFloat(se.value.toString()), 0)

            // 3. Fixed Operating Expenses (Payables created in period)
            const payables = await Payable.findAll({
                where: {
                    createdAt: { [Op.between]: [startDate, endDate] },
                    status: { [Op.ne]: 'cancelado' }
                },
                include: [CostCenter]
            })

            const ccMap = new Map<string, number>()
            payables.forEach(p => {
                const ccName = (p as any).CostCenter?.name || 'Geral'
                ccMap.set(ccName, (ccMap.get(ccName) || 0) + parseFloat(p.value.toString()))
            })

            const operatingExpensesByCC = Array.from(ccMap.entries()).map(([name, value]) => ({ name, value }))
            const totalOperatingExpenses = operatingExpensesByCC.reduce((sum, item) => sum + item.value, 0)

            // 4. Totals
            const grossProfit = totalRevenue - (totalProductCosts + totalServiceExpenses)
            const netResult = grossProfit - totalOperatingExpenses

            const dre: DREVolumes = {
                revenue: totalRevenue,
                directCosts: {
                    productCosts: totalProductCosts,
                    serviceExpenses: totalServiceExpenses
                },
                operatingExpenses: {
                    total: totalOperatingExpenses,
                    byCostCenter: operatingExpensesByCC
                },
                grossProfit,
                netResult
            }

            return res.send(dre)
        } catch (error) {
            console.error(error)
            return res.status(500).send({ error: 'Internal Server Error' })
        }
    }
}

export default DreReportController
