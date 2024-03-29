import { FastifyRequest, FastifyReply } from 'fastify'
import puppeteer, { Browser } from 'puppeteer'
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
import Product from '../models/Product'
import db from '../db'

type serviceOrdersRequest = FastifyRequest<{
    Body: Service_order
    Params: Service_order
    Querystring: Service_order & { filter: 'last_three' | 'pending' }
    Headers: any
}>

class serviceOrdersController {
    static async index(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        const { filter, ClientId } = req.query

        let limit,
            where = {}

        if (filter == 'last_three') {
            limit = 3
        }

        if (ClientId) {
            where = { ClientId: ClientId }
        }

        return res.send(
            await Service_order.findAll({
                order: [['createdAt', 'DESC']],
                limit,
                where,
                include: [{ model: Project, include: [Client] }, Client],
            }),
        )
    }

    static async show(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(
            await Service_order.findByPk(req.params.id, {
                include: [Protocol, { model: Project, include: [Client] }, Client],
            }),
        )
    }

    static async store(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        const { subject, description, ProjectId, ClientId } = req.body

        let project = ProjectId ? await Project.findByPk(ProjectId) : undefined

        const os = await Service_order.create({
            subject,
            description,
            ProjectId,
            ClientId: project?.ClientId ?? ClientId ?? null,
        })

        await os?.createProtocol()

        return res.send(os)
    }

    static async update(req: serviceOrdersRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { description, subject, status } = req.body

        const transaction = await db.transaction()

        const os = await Service_order.findByPk(id)
        const protocol = await os?.getProtocol()

        if (status == 'Finalizado') await protocol?.update({ status: 'Fechado' })
        if (status == 'Cancelado') await protocol?.update({ status: 'Cancelado' })

        await protocol?.save({ transaction })

        await os?.update({ description, subject, status })
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

        const template = fs.readFileSync(path.resolve('src', 'views', 'budget.ejs'), 'utf-8')

        const html = ejs.render(template, { os })

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
}

export default serviceOrdersController
