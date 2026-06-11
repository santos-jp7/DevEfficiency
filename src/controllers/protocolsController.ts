import { FastifyRequest, FastifyReply } from 'fastify'
import { Op } from 'sequelize'
import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'
import ejs from 'ejs'
import moment from 'moment'

import Product from '../models/Product'
import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'
import Protocol_register from '../models/Protocol_register'
import Receipts from '../models/Receipts'
import Client from '../models/Client'
import Project from '../models/Project'
import Service_order from '../models/Service_order'
import Subscription from '../models/Subscription'
import Config from '../models/Config'
import Billing from '../models/Billing'
import BillingProtocol from '../models/BillingProtocol'

type protocolsRequest = FastifyRequest<{
    Body: Protocol
    Params: Protocol
    Headers: any
    Querystring: { type: string; ClientId: number }
}>

class protocolsController {
    static async index(req: protocolsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { ClientId, page = 1, limit = 10, status } = req.query as any

        let opts: any = {
            include: [
                Protocol_register,
                { model: Protocol_product, include: [Product] },
                Receipts,
                {
                    model: Service_order,
                    include: [Client],
                },
                {
                    model: Subscription,
                    include: [Client],
                },
            ],
            ...(limit != -1 && { limit: parseInt(limit) }),
            ...(limit != -1 && { offset: (page - 1) * limit }),
        }

        if (ClientId) {
            const os_ids = (await Service_order.findAll({ where: { ClientId: ClientId } })).map((v) => v.id)
            const subscription_ids = (await Subscription.findAll({ where: { ClientId: ClientId } })).map((v) => v.id)

            opts.where = {
                [Op.or]: {
                    SubscriptionId: subscription_ids,
                    ServiceOrderId: os_ids,
                },
            }
        }

        if (status) {
            opts.where = {
                ...opts.where,
                status: {
                    [Op.in]: status.split(','),
                },
            }
        }

        const { count, rows } = await Protocol.findAndCountAll(opts)

        return res.send({
            data: rows,
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
        })
    }

    static async show(req: protocolsRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(
            await Protocol.findByPk(req.params.id, {
                include: [Protocol_register, { model: Protocol_product, include: [Product] }, Receipts],
            }),
        )
    }

    static async update(req: protocolsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { status, notes, current_installment, total_installments } = req.body as any

        const protocol = await Protocol.findByPk(id)
        if (!protocol) throw new Error('Protocolo não existe.')

        await protocol.update({ status, notes, current_installment, total_installments })

        // When releasing for payment, create a new billing if current billing is already faturada
        if (status === 'Liberado para pagamento') {
            const existingBPs = await BillingProtocol.findAll({
                where: { ProtocolId: id },
                include: [Billing],
                order: [['createdAt', 'DESC']],
            })
            if ((existingBPs[0] as any)?.Billing?.status === 'faturada') {
                let clientId: number | undefined
                if (protocol.ServiceOrderId) {
                    const so = await Service_order.findByPk(protocol.ServiceOrderId)
                    clientId = (so as any)?.ClientId
                } else if (protocol.SubscriptionId) {
                    const sub = await Subscription.findByPk(protocol.SubscriptionId)
                    clientId = (sub as any)?.ClientId
                }
                const products = await Protocol_product.findAll({ where: { ProtocolId: id } })
                const totalValue = products.reduce((sum, p) => sum + Number((p as any).value), 0)
                const newBilling = await Billing.create({
                    ClientId: clientId,
                    status: 'pendente',
                    total_value: totalValue,
                    due_date: moment().add(30, 'days').toDate(),
                } as any)
                await BillingProtocol.create({
                    BillingId: (newBilling as any).id,
                    ProtocolId: typeof id === 'string' ? parseInt(id) : id,
                    value: totalValue,
                } as any)
            }
        }

        return res.send(protocol)
    }

    static async pdf(req: protocolsRequest, res: FastifyReply) {
        const { type = 'Liberado para pagamento', ClientId } = req.query

        const client = await Client.findByPk(ClientId)
        const oss = await client?.getService_orders({
            include: [
                {
                    model: Protocol,
                    include: [{ model: Protocol_product, include: [Product] }, Protocol_register, Receipts],
                    where: {
                        status: type,
                    },
                },
                Project,
            ],
        })

        const subscriptions = await client?.getSubscriptions({
            include: [
                {
                    model: Protocol,
                    include: [{ model: Protocol_product, include: [Product] }, Protocol_register, Receipts],
                    where: {
                        status: type,
                    },
                },
                Project,
            ],
        })

        const config = await Config.findAll({})
        const configMap: { [key: string]: string | null } = {}
        config.forEach((cfg) => {
            if (cfg.upload) {
                const file = fs.readFileSync(path.join(process.cwd(), 'tmp', cfg.value))
                const extension = path.extname(cfg.value).substring(1)

                //is image?
                if (['png', 'jpg', 'jpeg', 'gif'].includes(extension.toLowerCase())) {
                    const fileBase64 = Buffer.from(file).toString('base64')
                    configMap[cfg.type] = `data:image/${extension};base64,${fileBase64}`
                } else {
                    configMap[cfg.type] = null
                }
            } else configMap[cfg.type] = cfg.value
        })

        const template = fs.readFileSync(path.resolve('src', 'views', 'budget_multi.ejs'), 'utf-8')
        const html = ejs.render(template, { oss, subscriptions, client, type, configMap })

        // return res.send(html)

        const browser = await puppeteer.launch({
            headless: 'new',
            executablePath: '/usr/bin/google-chrome',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        })

        const page = await browser.newPage()
        await page.setContent(html, { waitUntil: 'networkidle0' })
        await page.emulateMediaType('screen')
        const pdf = await page.pdf()
        await page.close()
        await browser.close()

        res.header('Content-Type', 'application/pdf')
        res.header(
            'Content-Disposition',
            `attachment; filename=protocols_${client?.name.toLowerCase().split(' ').join('_')}_${Date.now()}.pdf`,
        )

        return res.send(pdf)
    }
}

export default protocolsController
