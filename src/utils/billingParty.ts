import moment from 'moment'
import { Op, Transaction } from 'sequelize'

import Billing from '../models/Billing'
import Client from '../models/Client'
import Supplier from '../models/Supplier'

// De quem é a cobrança: cliente (padrão) ou fornecedor (comissão de protocolos por comissão).
export type BillingParty = { ClientId: number; SupplierId?: null } | { SupplierId: number; ClientId?: null }

export function partyOf(billing: Pick<Billing, 'ClientId' | 'SupplierId'>): BillingParty | null {
    if (billing.SupplierId) return { SupplierId: billing.SupplierId }
    if (billing.ClientId) return { ClientId: billing.ClientId }
    return null
}

async function nextDueDateFor(party: BillingParty, transaction?: Transaction | null): Promise<Date> {
    if (party.SupplierId) {
        const supplier = await Supplier.findByPk(party.SupplierId, { transaction })
        const days = Number(supplier?.commission_payment_days)
        return moment()
            .add(Number.isFinite(days) && days >= 0 ? days : 30, 'days')
            .toDate()
    }

    const client = await Client.findByPk(party.ClientId as number, { transaction })
    const due = moment().set('date', client?.due_day || 1)
    if (due.isBefore(moment(), 'day')) due.add(1, 'month')
    return due.toDate()
}

// Cobrança pendente da parte (cliente ou fornecedor); cria uma nova com o vencimento padrão da parte se não houver.
export async function findOrCreatePendingBilling(party: BillingParty, transaction?: Transaction | null): Promise<Billing> {
    const where = party.SupplierId
        ? { SupplierId: party.SupplierId, status: 'pendente', fixed_due_date: false }
        : { ClientId: party.ClientId, SupplierId: null, status: 'pendente', fixed_due_date: false }

    const existing = await Billing.findOne({ where: where as any, transaction })
    if (existing) return existing

    return createPendingBilling(party, transaction)
}

// Sempre cria uma cobrança nova (ex.: próxima parcela).
export async function createPendingBilling(party: BillingParty, transaction?: Transaction | null): Promise<Billing> {
    return Billing.create(
        {
            ClientId: party.SupplierId ? null : (party.ClientId as number),
            SupplierId: party.SupplierId || null,
            status: 'pendente',
            due_date: await nextDueDateFor(party, transaction),
        },
        { transaction },
    )
}

// Cobrança de parcela: uma por parte e vencimento (parcelas de protocolos diferentes no mesmo dia vão juntas).
export async function findOrCreateFixedBilling(party: BillingParty, dueDate: string, transaction?: Transaction | null): Promise<Billing> {
    const day = moment(dueDate, 'YYYY-MM-DD')
    const where: any = {
        status: 'pendente',
        fixed_due_date: true,
        due_date: { [Op.between]: [day.clone().startOf('day').toDate(), day.clone().endOf('day').toDate()] },
        ...(party.SupplierId ? { SupplierId: party.SupplierId } : { ClientId: party.ClientId, SupplierId: null }),
    }
    const existing = await Billing.findOne({ where, transaction })
    if (existing) return existing

    return Billing.create(
        {
            ClientId: party.SupplierId ? null : (party.ClientId as number),
            SupplierId: party.SupplierId || null,
            status: 'pendente',
            fixed_due_date: true,
            // Meio-dia: evita que o fuso desloque a data do vencimento.
            due_date: day.clone().hour(12).toDate(),
        },
        { transaction },
    )
}

export async function refreshBillingTotal(billing: Billing, transaction?: Transaction | null) {
    const billingProtocols = await billing.getBillingProtocols({ transaction })
    const total_value = billingProtocols.reduce((sum, v) => sum + v.value, 0)
    await billing.update({ total_value }, { transaction })
}
