import fs from 'fs'
import path from 'path'
import ejs from 'ejs'
import { Resend } from 'resend'
import moment from 'moment'

import Billing from '../models/Billing'
import BillingFile from '../models/BillingFile'
import BillingProtocol from '../models/BillingProtocol'
import Protocol from '../models/Protocol'
import Protocol_register from '../models/Protocol_register'
import Protocol_product from '../models/Protocol_product'
import Product from '../models/Product'
import Client from '../models/Client'
import Contact from '../models/Contact'

const resend = new Resend(process.env.RESEND_API_KEY!)
const FROM = process.env.RESEND_FROM || 'fatura@codlinx.com.br'

function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export async function sendBillingEmail(billingId: number): Promise<void> {
    const billing = await Billing.findByPk(billingId, {
        include: [
            {
                model: Client,
                include: [Contact],
            },
            BillingFile,
            {
                model: BillingProtocol,
                include: [
                    {
                        model: Protocol,
                        include: [
                            { model: Protocol_register },
                            { model: Protocol_product, include: [Product] },
                        ],
                    },
                ],
            },
        ],
    })

    if (!billing) throw new Error('Cobrança não encontrada')

    const client = (billing as any).Client as any
    const contacts: any[] = (client?.Contacts || []).filter((c: any) => c.email)
    if (contacts.length === 0) throw new Error('Nenhum contato com email cadastrado')

    const items: { description: string; installment: string | null; value: string }[] = []

    for (const bp of (billing as any).BillingProtocols || []) {
        const protocol = bp.Protocol
        if (!protocol) continue

        for (const reg of protocol.Protocol_registers || []) {
            items.push({
                description: reg.description,
                installment: null,
                value: formatCurrency(reg.value),
            })
        }

        for (const prod of protocol.Protocol_products || []) {
            const installment =
                protocol.total_installments && protocol.current_installment
                    ? `${protocol.current_installment} de ${protocol.total_installments}`
                    : null
            items.push({
                description: prod.Product?.description || `Produto #${prod.ProductId}`,
                installment,
                value: formatCurrency(prod.value),
            })
        }
    }

    const templatePath = path.resolve('src', 'views', 'billing-email.ejs')
    const template = fs.readFileSync(templatePath, 'utf-8')

    const billingFiles: any[] = (billing as any).BillingFiles || []
    const boletoFile = billingFiles.filter((f) => f.type === 'boleto').sort((a, b) => b.id - a.id)[0]
    const notaFiscalFile = billingFiles.filter((f) => f.type === 'nota_fiscal').sort((a, b) => b.id - a.id)[0]
    const hasAttachments = !!(boletoFile || notaFiscalFile)

    const html = ejs.render(template, {
        clientName: client?.corporate_name || client?.name,
        totalValue: formatCurrency(Number(billing.total_value)),
        dueDate: billing.due_date ? moment.utc(billing.due_date as any).format('DD/MM/YYYY') : '-',
        items,
        hasAttachments,
    })

    const attachments: { filename: string; content: Buffer }[] = []

    if (boletoFile) {
        try {
            const resp = await fetch(boletoFile.url)
            const buf = Buffer.from(await resp.arrayBuffer())
            attachments.push({ filename: boletoFile.filename, content: buf })
        } catch (e) {
            console.error('Erro ao baixar boleto:', e)
        }
    }

    if (notaFiscalFile) {
        try {
            const resp = await fetch(notaFiscalFile.url)
            const buf = Buffer.from(await resp.arrayBuffer())
            attachments.push({ filename: notaFiscalFile.filename, content: buf })
        } catch (e) {
            console.error('Erro ao baixar nota fiscal:', e)
        }
    }

    const to = contacts.map((c) => c.email)

    await resend.emails.send({
        from: FROM,
        to,
        subject: `Fatura disponível — ${client?.corporate_name || client?.name}`,
        html,
        attachments: attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
        })),
    })
}
