import { Op, Transaction } from 'sequelize'

import Opportunity, { LOST_REASONS, OPPORTUNITY_STAGES, OpportunityStage, STAGE_PROBABILITY } from '../models/Opportunity'
import OpportunityStageHistory from '../models/OpportunityStageHistory'
import CrmActivity from '../models/CrmActivity'
import db from '../db'
import Lead from '../models/Lead'
import Client from '../models/Client'
import Contact from '../models/Contact'
import Project from '../models/Project'
import Protocol from '../models/Protocol'
import { createServiceOrder } from './serviceOrderFactory'
import { StandaloneError, createStandaloneProtocol, validateStandalone } from './standaloneProtocol'
import { CommissionInputError, parseCommissionInput } from './commissionInput'
import { summarizeProtocol } from './pricing'

export class CrmInputError extends Error {}

export const blank = (v: any) => v === undefined || v === null || v === ''

// Muda a etapa gravando histórico. Perdido exige motivo; reabrir limpa ganho/perda.
export async function changeStage(
    opportunity: Opportunity,
    to: OpportunityStage,
    extra: { lost_reason?: any; lost_details?: any; probability?: any } = {},
    transaction?: Transaction | null,
): Promise<Opportunity> {
    if (!OPPORTUNITY_STAGES.includes(to)) throw new CrmInputError('Etapa inválida.')

    const from = opportunity.stage
    const patch: any = {}

    if (to === 'Perdido') {
        if (!LOST_REASONS.includes(extra.lost_reason)) throw new CrmInputError('Informe o motivo da perda.')
        patch.lost_reason = extra.lost_reason
        patch.lost_details = blank(extra.lost_details) ? null : String(extra.lost_details).slice(0, 255)
    }

    if (from === to) {
        if (Object.keys(patch).length) await opportunity.update(patch, { transaction })
        return opportunity
    }

    if ((opportunity.ServiceOrderId || opportunity.ProtocolId) && to !== 'Ganho')
        throw new CrmInputError('Oportunidade já convertida (OS/protocolo gerado): não pode sair de Ganho.')

    const now = new Date()
    patch.stage = to
    patch.stage_changed_at = now
    patch.probability = blank(extra.probability) ? STAGE_PROBABILITY[to] : Number(extra.probability)
    patch.won_at = to === 'Ganho' ? now : null
    patch.lost_at = to === 'Perdido' ? now : null
    if (to !== 'Perdido') {
        patch.lost_reason = null
        patch.lost_details = null
    }

    await opportunity.update(patch, { transaction })
    await OpportunityStageHistory.create({ OpportunityId: opportunity.id, from_stage: from, to_stage: to }, { transaction })

    return opportunity
}

// Próximo follow-up pendente (mais cedo) por oportunidade.
export async function nextFollowups(opportunityIds: number[]): Promise<Map<number, CrmActivity>> {
    const map = new Map<number, CrmActivity>()
    if (opportunityIds.length === 0) return map

    const pending = await CrmActivity.findAll({
        where: { OpportunityId: { [Op.in]: opportunityIds }, done_at: null, due_at: { [Op.ne]: null } } as any,
        order: [['due_at', 'ASC']],
    })
    for (const a of pending) if (a.OpportunityId && !map.has(a.OpportunityId)) map.set(a.OpportunityId, a)

    return map
}

// ---------------------------------------------------------------------------------------------------------------
// Conversão: ganhar a oportunidade gera o resultado no sistema (cliente + OS ou protocolo avulso).

export type WinInput = {
    mode: 'os' | 'protocol' | 'none'
    // OS
    subject?: string
    description?: string
    gravidade?: 'Crítico' | 'Alto' | 'Médio' | 'Baixo' | null
    prazo?: string | null
    ProjectId?: number | null
    // Protocolo avulso
    registers?: any[]
    products?: any[]
    discount_value?: number | string | null
    notes?: string | null
    // Cobrança (padrão: a da oportunidade)
    billing_mode?: string
    CommissionSupplierId?: number | string | null
    commission_percent?: number | string | null
    commission_value?: number | string | null
}

export type WinResult = {
    opportunity: Opportunity
    ClientId: number | null
    created_client: boolean
    ServiceOrderId: number | null
    ProtocolId: number | null
    BillingId: number | null
}

const COMMISSION_KEYS = ['billing_mode', 'CommissionSupplierId', 'commission_percent', 'commission_value'] as const

// Campos de cobrança: o que veio no corpo vale; o resto vem da oportunidade (valor manual só se travado nela).
function commissionInputFor(opportunity: Opportunity, input: WinInput) {
    const fromOpp: any = {
        billing_mode: opportunity.billing_mode || 'Direto',
        CommissionSupplierId: opportunity.CommissionSupplierId ?? null,
        commission_percent: opportunity.commission_percent ?? '',
        commission_value: opportunity.commission_manual ? opportunity.commission_value ?? '' : '',
    }
    for (const k of COMMISSION_KEYS) if (k in input) fromOpp[k] = (input as any)[k]
    return fromOpp
}

// Cliente novo a partir do lead. Documento só com dígitos (a coluna de cliente tem 15 posições).
async function clientFromLead(lead: Lead): Promise<{ client: Client; contact: Contact | null }> {
    const digits = (lead.document || '').replace(/\D/g, '')
    const t = await db.transaction()
    try {
        const client = await Client.create(
            {
                name: (lead.company || lead.name).slice(0, 128),
                corporate_name: lead.company || null,
                email: lead.email || null,
                document: digits && digits.length <= 15 ? digits : null,
            } as any,
            { transaction: t },
        )
        const contact =
            lead.email || lead.phone || lead.whatsapp || lead.company
                ? await Contact.create(
                      { name: lead.name, email: lead.email || null, number: lead.phone || null, whatsapp: lead.whatsapp || null, ClientId: client.id } as any,
                      { transaction: t },
                  )
                : null
        await lead.update({ status: 'Convertido', ClientId: client.id }, { transaction: t })
        await t.commit()
        return { client, contact }
    } catch (e) {
        await t.rollback()
        throw e
    }
}

export async function winOpportunity(opportunity: Opportunity, input: WinInput): Promise<WinResult> {
    const mode = input?.mode
    if (!['os', 'protocol', 'none'].includes(mode)) throw new CrmInputError('Escolha o que gerar: OS, protocolo avulso ou nada.')
    if (opportunity.ServiceOrderId || opportunity.ProtocolId) throw new CrmInputError('Oportunidade já convertida.')

    const lead = opportunity.LeadId ? await Lead.findByPk(opportunity.LeadId) : null
    if (lead?.status === 'Descartado') throw new CrmInputError('Lead descartado: reative o lead antes de ganhar a oportunidade.')

    const existingClientId = opportunity.ClientId || lead?.ClientId || null
    if (!existingClientId && !lead) throw new CrmInputError('Oportunidade sem lead nem cliente.')

    // 1) Valida tudo antes de gravar qualquer coisa.
    const commission = commissionInputFor(opportunity, input)
    const SellerId = opportunity.SellerId || lead?.SellerId || null

    if (mode === 'os') {
        if (!String(input.subject || opportunity.title || '').trim()) throw new CrmInputError('Informe o assunto da OS.')
        if (input.ProjectId) {
            const project = await Project.findByPk(input.ProjectId)
            if (!project) throw new CrmInputError('Projeto não encontrado.')
            if (existingClientId && project.ClientId && project.ClientId !== existingClientId)
                throw new CrmInputError('O projeto escolhido é de outro cliente.')
        }
        try {
            const parsed = await parseCommissionInput(commission)
            if (parsed.billing_mode === 'Comissão' && !parsed.CommissionSupplierId)
                throw new CrmInputError('Selecione o fornecedor que paga a comissão.')
        } catch (e) {
            if (e instanceof CommissionInputError) throw new CrmInputError(e.message)
            throw e
        }
    }

    const standaloneInput = {
        ClientId: existingClientId,
        SellerId,
        notes: input.notes ?? `Oportunidade #${opportunity.id} — ${opportunity.title}`,
        discount_value: input.discount_value,
        registers: input.registers,
        products: input.products,
        ...commission,
    }

    if (mode === 'protocol') {
        try {
            await validateStandalone(standaloneInput, { requireClient: false })
        } catch (e) {
            if (e instanceof StandaloneError) throw new CrmInputError(e.message)
            throw e
        }
    }

    // 2) Cliente: existente ou criado a partir do lead.
    let ClientId = existingClientId
    let created: { client: Client; contact: Contact | null } | null = null
    if (!ClientId && lead) {
        created = await clientFromLead(lead)
        ClientId = created.client.id
    }

    // Desfaz o cliente recém-criado se a geração falhar (OS/avulso usam transações próprias).
    const undoClient = async () => {
        if (!created) return
        await created.contact?.destroy().catch(() => {})
        await lead?.update({ status: 'Ativo', ClientId: null }).catch(() => {})
        await created.client.destroy().catch((e) => console.error('[crm] não foi possível desfazer o cliente', created?.client.id, e))
    }

    let ServiceOrderId: number | null = null
    let ProtocolId: number | null = null
    let BillingId: number | null = null
    let realValue: number | null = null

    try {
        if (mode === 'os') {
            const os = await createServiceOrder({
                subject: String(input.subject || opportunity.title).slice(0, 128),
                description: (input.description || `Oportunidade #${opportunity.id} — ${opportunity.title}`).slice(0, 255),
                ProjectId: input.ProjectId || null,
                ClientId,
                gravidade: input.gravidade || null,
                prazo: input.prazo || null,
            })
            ServiceOrderId = os.id

            const protocol = await Protocol.findOne({ where: { ServiceOrderId: os.id } })
            if (protocol) {
                await protocol.update({ SellerId, ...((await parseCommissionInput(commission)) as any) })
                ProtocolId = protocol.id
            }
        } else if (mode === 'protocol') {
            const result = await createStandaloneProtocol({ ...standaloneInput, ClientId })
            ProtocolId = result.protocol.id
            BillingId = result.BillingId
            const full = await Protocol.findByPk(ProtocolId, { include: ['Protocol_registers', 'Protocol_products'] })
            realValue = summarizeProtocol(full).total_net
        }
    } catch (e) {
        // Protocolo criado mas não liberado: mantém o cliente (o protocolo depende dele) e registra o vínculo.
        if (e instanceof StandaloneError && e.ProtocolId) {
            await opportunity.update({ ClientId, ProtocolId: e.ProtocolId })
            throw new CrmInputError(e.message)
        }
        await undoClient()
        if (e instanceof StandaloneError) throw new CrmInputError(e.message)
        throw e
    }

    // 3) Ganho + vínculos.
    const t = await db.transaction()
    try {
        await opportunity.update(
            { ClientId, ServiceOrderId, ProtocolId, ...(realValue !== null ? { estimated_value: realValue } : {}) },
            { transaction: t },
        )
        await changeStage(opportunity, 'Ganho', {}, t)
        await t.commit()
    } catch (e) {
        await t.rollback()
        throw e
    }

    // Atividades abertas do lead passam a aparecer no cliente também.
    if (created) await CrmActivity.update({ ClientId }, { where: { LeadId: lead!.id, ClientId: null } as any })

    return { opportunity, ClientId, created_client: !!created, ServiceOrderId, ProtocolId, BillingId }
}
