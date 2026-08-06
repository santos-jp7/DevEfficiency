import { FastifyRequest, FastifyReply } from 'fastify'
import puppeteer, { Browser } from 'puppeteer'
import { Op } from 'sequelize'
import fs from 'fs'
import path from 'path'
import ejs from 'ejs'

import Client from '../models/Client'
import Project from '../models/Project'
import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'
import Protocol_register from '../models/Protocol_register'
import Receipts from '../models/Receipts'
import Service_order from '../models/Service_order'
import SlaLevel from '../models/SlaLevel'
import ClientSlaConfig from '../models/ClientSlaConfig'
import Product from '../models/Product'
import Config from '../models/Config'
import BankAccount from '../models/BankAccount'

import db from '../db'

type serviceOrdersRequest = FastifyRequest<{
    Body: Service_order
    Params: Service_order
    Querystring: Service_order & { filter: 'last_three' | 'pending' }
    Headers: any
}>

type invoicePdfRequest = FastifyRequest<{
    Params: { id: string }
    Querystring: { currency?: string; BankAccountId?: string }
}>

class serviceOrdersController {
    static async index(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        let { filter, ClientId, page = 1, limit = 10, status } = req.query as any

        let where: any = {}

        if (filter == 'last_three') {
            limit = 3
        }

        if (ClientId) {
            where.ClientId = ClientId
        }

        if (status) {
            where.status = {
                [Op.in]: status.split(','),
            }
        }

        const { count, rows } = await Service_order.findAndCountAll({
            order: [['createdAt', 'DESC']],
            ...(limit != -1 && {
                limit: parseInt(limit),
                offset: (page - 1) * limit,
            }),
            where,
            include: [{ model: Project, include: [Client] }, Client, { model: SlaLevel, as: 'SlaLevel' }],
        })

        return res.send({
            data: rows,
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
        })
    }

    static async show(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(
            await Service_order.findByPk(req.params.id, {
                include: [Protocol, { model: Project, include: [Client] }, Client, { model: SlaLevel, as: 'SlaLevel' }],
            }),
        )
    }

    static async store(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        const { subject, description, ProjectId, ClientId, SlaLevelId, gravidade, prazo } = req.body as any

        let project = ProjectId ? await Project.findByPk(ProjectId) : undefined
        const resolvedClientId = project?.ClientId ?? ClientId ?? null

        const os = await Service_order.create({
            subject,
            description,
            ProjectId,
            ClientId: resolvedClientId,
            gravidade: gravidade || null,
            prazo: prazo ? new Date(prazo) : null,
        })

        await os?.createProtocol()

        const updatePayload: any = {}

        if (gravidade && resolvedClientId) {
            const slaConfig = await ClientSlaConfig.findOne({ where: { ClientId: resolvedClientId, gravidade } })
            if (slaConfig && os.createdAt) {
                const base = new Date(os.createdAt)
                updatePayload.sla_response_deadline = new Date(base.getTime() + slaConfig.response_hours * 3600000)
                updatePayload.sla_solution_deadline = new Date(base.getTime() + slaConfig.solution_hours * 3600000)
            }
        } else if (SlaLevelId) {
            const slaLevel = await SlaLevel.findByPk(SlaLevelId)
            if (slaLevel && os.createdAt) {
                const base = new Date(os.createdAt)
                updatePayload.SlaLevelId = SlaLevelId
                updatePayload.sla_response_deadline = new Date(base.getTime() + slaLevel.response_hours * 3600000)
                updatePayload.sla_solution_deadline = new Date(base.getTime() + slaLevel.solution_hours * 3600000)
            }
        }

        if (Object.keys(updatePayload).length > 0) {
            await os.update(updatePayload)
        }

        return res.send(os)
    }

    static async update(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { description, subject, status, SlaLevelId, gravidade, prazo } = req.body as any

        const transaction = await db.transaction()

        const os = await Service_order.findByPk(id)
        const protocol = await os?.getProtocol()

        if (status == 'Finalizado') await protocol?.update({ status: 'Fechado' })
        if (status == 'Cancelado') await protocol?.update({ status: 'Cancelado' })

        await protocol?.save({ transaction })

        const updatePayload: any = { description, subject, status }

        if (prazo !== undefined) {
            updatePayload.prazo = prazo ? new Date(prazo) : null
        }

        if (gravidade !== undefined) {
            updatePayload.gravidade = gravidade || null
            if (gravidade && os?.ClientId) {
                const slaConfig = await ClientSlaConfig.findOne({ where: { ClientId: os.ClientId, gravidade } })
                if (slaConfig && os.createdAt) {
                    const base = new Date(os.createdAt)
                    updatePayload.sla_response_deadline = new Date(base.getTime() + slaConfig.response_hours * 3600000)
                    updatePayload.sla_solution_deadline = new Date(base.getTime() + slaConfig.solution_hours * 3600000)
                }
            } else if (!gravidade) {
                updatePayload.sla_response_deadline = null
                updatePayload.sla_solution_deadline = null
            }
        } else if (SlaLevelId !== undefined) {
            if (SlaLevelId) {
                const slaLevel = await SlaLevel.findByPk(SlaLevelId)
                if (slaLevel && os?.createdAt) {
                    const base = new Date(os.createdAt)
                    updatePayload.SlaLevelId = SlaLevelId
                    updatePayload.sla_response_deadline = new Date(base.getTime() + slaLevel.response_hours * 3600000)
                    updatePayload.sla_solution_deadline = new Date(base.getTime() + slaLevel.solution_hours * 3600000)
                }
            } else {
                updatePayload.SlaLevelId = null
                updatePayload.sla_response_deadline = null
                updatePayload.sla_solution_deadline = null
            }
        }

        await os?.update(updatePayload)
        await os?.save({ transaction })

        await transaction.commit()

        return res.send(os)
    }

    static async pdf(req: serviceOrdersRequest, res: FastifyReply) {
        const { id } = req.params

        const os = await Service_order.findByPk(id, {
            include: [
                Client,
                {
                    model: Protocol,
                    include: [Protocol_register, Receipts, { model: Protocol_product, include: [Product] }],
                },
                { model: Project, include: [Client] },
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

        const template = fs.readFileSync(path.resolve('src', 'views', 'budget.ejs'), 'utf-8')
        const html = ejs.render(template, { os, configMap })

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
        res.header('Content-Disposition', `attachment; filename=os_${os?.id}_${Date.now()}.pdf`)

        return res.send(pdf)
    }

    static async invoicePdf(req: invoicePdfRequest, res: FastifyReply) {
        const { id } = req.params
        const { currency = 'USD', BankAccountId } = req.query

        const os = await Service_order.findByPk(id, {
            include: [
                Client,
                {
                    model: Protocol,
                    include: [Protocol_register, { model: Protocol_product, include: [Product] }],
                },
                { model: Project, include: [Client] },
            ],
        })

        const bankAccount = BankAccountId ? await BankAccount.findByPk(BankAccountId) : null

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

        const template = fs.readFileSync(path.resolve('src', 'views', 'invoice_exterior.ejs'), 'utf-8')
        const html = ejs.render(template, { os, configMap, currency, bankAccount })

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
        res.header('Content-Disposition', `attachment; filename=invoice_os_${os?.id}_${Date.now()}.pdf`)

        return res.send(pdf)
    }
}

export default serviceOrdersController
