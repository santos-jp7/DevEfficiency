import { v4 as uuidv4 } from 'uuid'

import db from '../db'
import Client from '../models/Client'
import Product from '../models/Product'
import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'
import Protocol_register from '../models/Protocol_register'
import BillingProtocol from '../models/BillingProtocol'
import Seller from '../models/Seller'
import { PricingError, buildRegisterData } from '../controllers/protocolsRegisterController'
import { MAX_QUANTITY } from '../controllers/protocolsProductController'
import { CommissionInputError, parseCommissionInput } from './commissionInput'

// Erro de validação/criação do lançamento avulso. status 500 = protocolo criado mas não liberado (ProtocolId preenchido).
export class StandaloneError extends Error {
    constructor(message: string, public status = 400, public ProtocolId: number | null = null) {
        super(message)
    }
}

export type StandaloneInput = {
    ClientId?: number | null
    SellerId?: number | null
    notes?: string | null
    discount_value?: number | string | null
    registers?: any[]
    products?: any[]
    billing_mode?: string
    CommissionSupplierId?: number | string | null
    commission_percent?: number | string | null
    commission_value?: number | string | null
}

// Valida tudo o que dá para validar sem gravar. requireClient=false quando o cliente ainda vai ser criado (CRM).
export async function validateStandalone(input: StandaloneInput, options: { requireClient?: boolean } = {}) {
    const { requireClient = true } = options

    let commission: Partial<Protocol> = {}
    try {
        commission = (await parseCommissionInput(input)) as Partial<Protocol>
    } catch (e) {
        if (e instanceof CommissionInputError) throw new StandaloneError(e.message)
        throw e
    }
    if (commission.billing_mode === 'Comissão' && !commission.CommissionSupplierId)
        throw new StandaloneError('Selecione o fornecedor que paga a comissão.')

    const client = input.ClientId ? await Client.findByPk(input.ClientId) : null
    if (requireClient && !client) throw new StandaloneError('Selecione o cliente.')

    const registerList: any[] = Array.isArray(input.registers) ? input.registers : []
    const productList: any[] = Array.isArray(input.products) ? input.products : []

    if (registerList.length + productList.length === 0) throw new StandaloneError('Lance ao menos um registro ou produto.')

    if (input.SellerId && !(await Seller.findByPk(input.SellerId))) throw new StandaloneError('Vendedor não encontrado.', 404)

    for (const r of registerList) {
        if (!r.description || !['Serviço', 'Despesa'].includes(r.type))
            throw new StandaloneError('Todo registro precisa de descrição e tipo (Serviço ou Despesa).')
    }

    for (const p of productList) {
        if (!p.ProductId || !(Number(p.value) >= 0)) throw new StandaloneError('Todo produto precisa de produto e valor.')
        const q = Number(p.quantity ?? 1)
        if (!Number.isInteger(q) || q < 1 || q > MAX_QUANTITY)
            throw new StandaloneError(`Quantidade deve ser um inteiro entre 1 e ${MAX_QUANTITY}.`)
        // Produto recorrente depende de assinatura; no avulso a cobrança é sempre única.
        if (p.charge_type && p.charge_type !== 'Único') throw new StandaloneError('Lançamento avulso aceita apenas produtos de cobrança única.')
        if (!(await Product.findByPk(p.ProductId))) throw new StandaloneError('Produto não encontrado.')
    }

    if (Number(input.discount_value) < 0) throw new StandaloneError('Desconto inválido para o total lançado.')

    return { client, commission, registerList, productList }
}

// Lançamento avulso: cria o protocolo direto para um cliente (sem OS/assinatura), lança serviços/despesas e produtos e
// libera para pagamento, o que gera/atualiza a cobrança pendente (do cliente ou, por comissão, do fornecedor).
export async function createStandaloneProtocol(input: StandaloneInput): Promise<{ protocol: Protocol; client: Client; BillingId: number | null }> {
    const { client, commission, registerList, productList } = await validateStandalone(input)

    const t = await db.transaction()
    let protocol: Protocol

    try {
        protocol = await Protocol.create(
            { status: 'Em aberto', ClientId: client!.id, SellerId: input.SellerId || null, notes: input.notes || null, ...commission } as any,
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

        const discount = Number(input.discount_value) || 0
        if (discount < 0 || discount > gross) throw new PricingError('Desconto inválido para o total lançado.')

        if (discount > 0) await protocol.update({ discount_value: discount }, { transaction: t })

        await t.commit()
    } catch (e) {
        await t.rollback()
        if (e instanceof PricingError) throw new StandaloneError(e.message)
        throw e
    }

    // Libera depois de gravar tudo: a transição para "Liberado para pagamento" gera a cobrança.
    try {
        await protocol.update({ status: 'Liberado para pagamento' })
    } catch (e: any) {
        console.error('[avulso] falha ao liberar protocolo', protocol.id, e)
        throw new StandaloneError(
            `Protocolo #${protocol.id} foi criado, mas não foi possível liberá-lo para pagamento: ${e.message}`,
            500,
            protocol.id,
        )
    }

    const billingProtocol = await BillingProtocol.findOne({ where: { ProtocolId: protocol.id }, order: [['id', 'DESC']] })

    return { protocol, client: client!, BillingId: billingProtocol?.BillingId || null }
}
