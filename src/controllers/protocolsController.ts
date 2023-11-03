import { FastifyRequest, FastifyReply } from 'fastify'
import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'
import ejs from 'ejs'

import Product from '../models/Product'
import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'
import Protocol_register from '../models/Protocol_register'
import Receipts from '../models/Receipts'
import Client from '../models/Client'
import Project from '../models/Project'

type protocolsRequest = FastifyRequest<{
    Body: Protocol
    Params: Protocol
    Headers: any
    Querystring: { type: string; ClientId: number }
}>

class protocolsController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        return res.send(await Protocol.findAll())
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
        const { status } = req.body

        const protocol = await Protocol.findByPk(id)
        if (!protocol) throw new Error('Protocolo não existe.')

        await protocol?.update({ status })
        await protocol?.save()

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

        const template = fs.readFileSync(path.resolve('src', 'views', 'budget_multi.ejs'), 'utf-8')
        const html = ejs.render(template, { oss, client, type })

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
