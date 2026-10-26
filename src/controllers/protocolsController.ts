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
import db from '../db'
import Seller from '../models/Seller'
import { PricingError, buildRegisterData } from './protocolsRegisterController'
import { MAX_QUANTITY } from './protocolsProductController'
import { v4 as uuidv4 } from 'uuid'
import { getClientByProtocol, summarizeProtocol, sumSummaries, withPricing, pricingView } from '../utils/pricing'

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
                Client,
                Seller,
                {
                    model: Service_order,
                    include: [Client],
                },
                {
                    model: Subscription,
                    include: [Client],
                },
            ],
            order: [['id', 'DESC']],
            distinct: true,
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
                    ClientId,
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

        const data = rows.map((protocol) => {
            const client =
                (protocol as any).Service_order?.Client ||
                (protocol as any).Subscription?.Client ||
                (protocol as any).Client
            return withPricing(protocol, client)
        })

        return res.send({
            data,
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
        })
    }

    static async show(req: protocolsRequest, res: FastifyReply): Promise<FastifyReply> {
        const protocol = await Protocol.findByPk(req.params.id, {
            include: [Protocol_register, { model: Protocol_product, include: [Product] }, Receipts, Seller],
        })

        if (!protocol) return res.send(protocol)

        const client = await getClientByProtocol(protocol)

        return res.send({
            ...withPricing(protocol, client),
            Client: client && {
                id: client.id,
                name: client.name,
                is_partner: client.is_partner,
                partner_discount_percent: client.partner_discount_percent,
            },
        })
    }

    // Lançamento avulso: cria o protocolo direto para um cliente (sem OS/assinatura), lança serviços/despesas e
    // produtos e já libera para pagamento, o que gera/atualiza a cobrança pendente do cliente pelas regras de sempre.
    static async storeStandalone(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        const { ClientId, SellerId, notes, discount_value, registers, products } = (req.body || {}) as any

        const client = ClientId ? await Client.findByPk(ClientId) : null
        if (!client) return res.status(400).send({ message: 'Selecione o cliente.' })

        const registerList: any[] = Array.isArray(registers) ? registers : []
        const productList: any[] = Array.isArray(products) ? products : []

        if (registerList.length + productList.length === 0)
            return res.status(400).send({ message: 'Lance ao menos um registro ou produto.' })

        if (SellerId && !(await Seller.findByPk(SellerId)))
            return res.status(404).send({ message: 'Vendedor não encontrado.' })

        for (const r of registerList) {
            if (!r.description || !['Serviço', 'Despesa'].includes(r.type))
                return res.status(400).send({ message: 'Todo registro precisa de descrição e tipo (Serviço ou Despesa).' })
        }

        for (const p of productList) {
            if (!p.ProductId || !(Number(p.value) >= 0))
                return res.status(400).send({ message: 'Todo produto precisa de produto e valor.' })
            const q = Number(p.quantity ?? 1)
            if (!Number.isInteger(q) || q < 1 || q > MAX_QUANTITY)
                return res.status(400).send({ message: `Quantidade deve ser um inteiro entre 1 e ${MAX_QUANTITY}.` })
            // Produto recorrente depende de assinatura; no avulso a cobrança é sempre única.
            if (p.charge_type && p.charge_type !== 'Único')
                return res.status(400).send({ message: 'Lançamento avulso aceita apenas produtos de cobrança única.' })
        }

        const t = await db.transaction()
        let protocol: Protocol

        try {
            protocol = await Protocol.create(
                { status: 'Em aberto', ClientId: client.id, SellerId: SellerId || null, notes: notes || null } as any,
                { transaction: t },
            )

            let gross = 0

            for (const r of registerList) {
                const data = await buildRegisterData(protocol, r)
                const created = await Protocol_register.create({ ...(data as any), ProtocolId: protocol.id }, { transaction: t })
                gross += Number(created.value)
            }

            for (const p of productList) {
                const product = await Product.findByPk(p.ProductId, { transaction: t })

                // Quantidade N = N linhas com o mesmo valor unitário; cada uma com sua licença quando o produto gera.
                for (let i = 0; i < (Number(p.quantity) || 1); i++) {
                    const created = await Protocol_product.create(
                        { ProductId: p.ProductId, charge_type: 'Único', value: Number(p.value), ProtocolId: protocol.id },
                        { transaction: t },
                    )
                    if (product?.generate_license) await created.createLicense({ key: uuidv4() }, { transaction: t })
                    gross += Number(created.value)
                }
            }

            const discount = Number(discount_value) || 0
            if (discount < 0 || discount > gross) throw new PricingError('Desconto inválido para o total lançado.')

            if (discount > 0) await protocol.update({ discount_value: discount }, { transaction: t })

            await t.commit()
        } catch (e) {
            await t.rollback()
            if (e instanceof PricingError) return res.status(400).send({ message: e.message })
            throw e
        }

        // Libera depois de gravar tudo: a transição para "Liberado para pagamento" gera a cobrança.
        try {
            await protocol.update({ status: 'Liberado para pagamento' })
        } catch (e: any) {
            console.error('[avulso] falha ao liberar protocolo', protocol.id, e)
            return res.status(500).send({
                message: `Protocolo #${protocol.id} foi criado, mas não foi possível liberá-lo para pagamento: ${e.message}`,
                ProtocolId: protocol.id,
            })
        }

        const created = await Protocol.findByPk(protocol.id, {
            include: [Protocol_register, { model: Protocol_product, include: [Product] }, Receipts, Client, Seller],
        })
        const billingProtocol = await BillingProtocol.findOne({
            where: { ProtocolId: protocol.id },
            order: [['id', 'DESC']],
        })

        return res.status(201).send({
            ...withPricing(created as Protocol, client),
            BillingId: billingProtocol?.BillingId || null,
        })
    }

    static async update(req: protocolsRequest, res: FastifyReply): Promise<FastifyReply> {
        const { id } = req.params
        const { status, notes, current_installment, total_installments, discount_value } = req.body as any

        const protocol = await Protocol.findByPk(id)
        if (!protocol) throw new Error('Protocolo não existe.')

        // Vendedor só pode ser trocado enquanto a comissão não foi gerada (protocolo não finalizado).
        const sellerPatch: any = {}
        if ('SellerId' in (req.body as any)) {
            const SellerId = (req.body as any).SellerId || null

            if (SellerId !== (protocol.SellerId || null)) {
                if (protocol.status === 'Fechado')
                    return res.status(400).send({ message: 'Protocolo finalizado: não é possível alterar o vendedor.' })
                if (SellerId && !(await Seller.findByPk(SellerId)))
                    return res.status(404).send({ message: 'Vendedor não encontrado.' })

                sellerPatch.SellerId = SellerId
            }
        }

        await protocol.update({
            status,
            notes,
            current_installment,
            total_installments,
            discount_value: discount_value ?? null,
            ...sellerPatch,
        })

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

        const protocols = [
            ...(oss || []).map((os) => (os as any).Protocol),
            ...(subscriptions || []).flatMap((sub) => (sub as any).Protocols || []),
        ].filter(Boolean)
        const pricing = sumSummaries(
            protocols.map((p) => summarizeProtocol(p, client)),
            client,
        )

        const template = fs.readFileSync(path.resolve('src', 'views', 'budget_multi.ejs'), 'utf-8')
        const html = ejs.render(template, { oss, subscriptions, client, type, configMap, pricing, pv: pricingView })

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
