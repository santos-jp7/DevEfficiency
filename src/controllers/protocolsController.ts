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
import Seller from '../models/Seller'
import Supplier from '../models/Supplier'
import { isCommission, summarizeCommission } from '../utils/protocolCommission'
import { CommissionInputError, parseCommissionInput } from '../utils/commissionInput'
import { StandaloneError, StandaloneInput, createStandaloneProtocol } from '../utils/standaloneProtocol'
import { getClientByProtocol, summarizeProtocol, sumSummaries, withPricing, pricingView } from '../utils/pricing'

// Campos de comissão vindos do corpo; depois de liberado, a cobrança já foi gerada com o valor/parte atuais.
async function commissionPatch(body: any, current?: Protocol | null): Promise<Partial<Protocol>> {
    const patch = await parseCommissionInput(body, current)

    if (current) {
        const changed = Object.keys(patch).some((k) => ((current as any)[k] ?? null) != ((patch as any)[k] ?? null))
        if (changed && current.status !== 'Em aberto')
            throw new CommissionInputError('A cobrança por comissão só pode ser alterada com o protocolo "Em aberto".')
    }

    return patch as Partial<Protocol>
}

const protocolJson = (protocol: Protocol, client: any) => ({
    ...withPricing(protocol, client),
    commission: summarizeCommission(protocol),
})

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
                { model: Supplier, as: 'CommissionSupplier' },
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
            return protocolJson(protocol, client)
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
            include: [
                Protocol_register,
                { model: Protocol_product, include: [Product] },
                Receipts,
                Seller,
                { model: Supplier, as: 'CommissionSupplier' },
            ],
        })

        if (!protocol) return res.send(protocol)

        const client = await getClientByProtocol(protocol)

        return res.send({
            ...protocolJson(protocol, client),
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
        let protocol: Protocol
        let client: Client
        let BillingId: number | null

        try {
            ;({ protocol, client, BillingId } = await createStandaloneProtocol((req.body || {}) as StandaloneInput))
        } catch (e) {
            if (e instanceof StandaloneError)
                return res.status(e.status).send({ message: e.message, ...(e.ProtocolId ? { ProtocolId: e.ProtocolId } : {}) })
            throw e
        }

        const created = await Protocol.findByPk(protocol.id, {
            include: [
                Protocol_register,
                { model: Protocol_product, include: [Product] },
                Receipts,
                Client,
                Seller,
                { model: Supplier, as: 'CommissionSupplier' },
            ],
        })
        return res.status(201).send({
            ...protocolJson(created as Protocol, client),
            BillingId,
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

        let commission: Partial<Protocol> = {}
        try {
            commission = await commissionPatch(req.body, protocol)
        } catch (e) {
            if (e instanceof CommissionInputError) return res.status(400).send({ message: e.message })
            throw e
        }

        await protocol.update({
            status,
            notes,
            current_installment,
            total_installments,
            discount_value: discount_value ?? null,
            ...sellerPatch,
            ...commission,
        })

        // When releasing for payment, create a new billing if current billing is already faturada
        // (protocolo por comissão: a cobrança é do fornecedor e já é gerada pelo hook).
        if (status === 'Liberado para pagamento' && !isCommission(protocol)) {
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
                    // Por comissão o cliente paga ao fornecedor: fica fora do extrato do que é devido a mim.
                    where: {
                        status: type,
                        billing_mode: 'Direto',
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
                    // Por comissão o cliente paga ao fornecedor: fica fora do extrato do que é devido a mim.
                    where: {
                        status: type,
                        billing_mode: 'Direto',
                    },
                },
                Project,
            ],
        })

        // Lançamentos avulsos: protocolos ligados direto ao cliente (sem OS/assinatura) na mesma situação.
        const avulsos = client
            ? await Protocol.findAll({
                  where: { ClientId: client.id, status: type, billing_mode: 'Direto', ServiceOrderId: null, SubscriptionId: null } as any,
                  include: [{ model: Protocol_product, include: [Product] }, Protocol_register, Receipts],
                  order: [['id', 'ASC']],
              })
            : []

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
            ...avulsos,
        ].filter(Boolean)
        const pricing = sumSummaries(
            protocols.map((p) => summarizeProtocol(p, client)),
            client,
        )

        const template = fs.readFileSync(path.resolve('src', 'views', 'budget_multi.ejs'), 'utf-8')
        const html = ejs.render(template, { oss, subscriptions, avulsos, client, type, configMap, pricing, pv: pricingView })

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
