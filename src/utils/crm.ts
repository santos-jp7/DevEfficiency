import { Op, Transaction } from 'sequelize'

import Opportunity, { LOST_REASONS, OPEN_STAGES, OPPORTUNITY_STAGES, OpportunityStage, STAGE_PROBABILITY } from '../models/Opportunity'
import OpportunityStageHistory from '../models/OpportunityStageHistory'
import CrmActivity from '../models/CrmActivity'
import db from '../db'
import Lead from '../models/Lead'
import Client from '../models/Client'
import Contact from '../models/Contact'
import Project from '../models/Project'
import Protocol from '../models/Protocol'
import Service_order from '../models/Service_order'
import { createServiceOrder } from './serviceOrderFactory'
import { StandaloneError, createStandaloneProtocol, validateStandalone } from './standaloneProtocol'
import { CommissionInputError, parseCommissionInput } from './commissionInput'
import { summarizeProtocol } from './pricing'
import { saveInstallmentsInput } from './paymentTerms'

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
    // Lead sem cliente: 'new' força criar; um ClientId usa esse cliente; vazio usa o de mesmo CNPJ/CPF se existir.
    client_choice?: 'new' | number | string | null
    // Condição de pagamento do protocolo gerado (OS ou avulso): "15/30/60" e/ou vencimentos manuais.
    payment_terms?: string | null
    installments?: { due_date: string; value: number | string }[] | null
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
    // Ganho de oportunidade vinda de OS em que a OS não pôde ser atualizada.
    warning?: string
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

    // Oportunidade que veio de uma OS: ganhar é só seguir com a própria OS (vai para a fila), sem gerar nada novo.
    if (opportunity.SourceServiceOrderId) {
        const t = await db.transaction()
        try {
            await changeStage(opportunity, 'Ganho', {}, t)
            await t.commit()
        } catch (e) {
            await t.rollback()
            throw e
        }
        const sync = await syncSourceServiceOrder(opportunity, 'Ganho')
        return {
            opportunity,
            ClientId: opportunity.ClientId ?? null,
            created_client: false,
            ServiceOrderId: opportunity.ServiceOrderId ?? null,
            ProtocolId: opportunity.ProtocolId ?? null,
            BillingId: null,
            ...(sync.warning ? { warning: sync.warning } : {}),
        }
    }

    const lead = opportunity.LeadId ? await Lead.findByPk(opportunity.LeadId) : null
    if (lead?.status === 'Descartado') throw new CrmInputError('Lead descartado: reative o lead antes de ganhar a oportunidade.')

    let existingClientId = opportunity.ClientId || lead?.ClientId || null
    if (!existingClientId && !lead) throw new CrmInputError('Oportunidade sem lead nem cliente.')

    // Lead que já é cliente cadastrado: usa o escolhido ou, sem escolha, o de mesmo CNPJ/CPF (nunca duplica).
    let linkLeadToClient: number | null = null
    if (!existingClientId && lead) {
        if (input.client_choice && input.client_choice !== 'new') {
            const chosen = await Client.findByPk(Number(input.client_choice))
            if (!chosen) throw new CrmInputError('Cliente escolhido não encontrado.')
            linkLeadToClient = chosen.id
        } else if (input.client_choice !== 'new') {
            const sameDoc = (await findClientMatches({ document: lead.document })).find((m) => m.reason === 'documento')
            if (sameDoc) linkLeadToClient = sameDoc.id
        }
        if (linkLeadToClient) existingClientId = linkLeadToClient
    }

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
        payment_terms: input.payment_terms ?? null,
        installments: input.installments ?? null,
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

    // 2) Cliente: existente (inclusive o encontrado pelo CNPJ) ou criado a partir do lead.
    if (linkLeadToClient && lead) await lead.update({ status: 'Convertido', ClientId: linkLeadToClient })
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
                if (input.payment_terms) await saveInstallmentsInput(protocol, { payment_terms: input.payment_terms })
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

// ---------------------------------------------------------------------------------------------------------------
// OS → oportunidade: orçamentos em aberto entram no funil; o desfecho no CRM volta para a OS.

// Etapa inicial conforme o andamento da OS.
const STAGE_FROM_OS: Record<string, OpportunityStage> = { 'Em avaliação': 'Qualificado', 'Orçamento enviado': 'Proposta' }
// OS ainda antes da execução: ao ganhar vai para "Na fila".
const PRE_EXECUTION = ['Backlog', 'Em avaliação', 'Orçamento enviado', 'Pendente']

export async function opportunityFromServiceOrder(serviceOrderId: number): Promise<Opportunity> {
    const os = await Service_order.findByPk(serviceOrderId, { include: [Project] })
    if (!os) throw new CrmInputError('OS não encontrada.')
    if (['Finalizado', 'Cancelado'].includes(os.status as string)) throw new CrmInputError(`OS ${os.status?.toLowerCase()}: não pode virar oportunidade.`)

    const existing = await Opportunity.findOne({ where: { SourceServiceOrderId: os.id } })
    if (existing) throw new CrmInputError(`Esta OS já está no CRM (oportunidade #${existing.id}).`)

    const ClientId = os.ClientId || (os as any).Project?.ClientId || null
    if (!ClientId) throw new CrmInputError('Vincule a OS a um cliente antes de enviar para o CRM.')

    const protocol = await Protocol.findOne({ where: { ServiceOrderId: os.id }, include: ['Protocol_registers', 'Protocol_products'] })
    const total = protocol ? summarizeProtocol(protocol).total_net : 0
    const stage = STAGE_FROM_OS[os.status as string] || 'Novo'

    const t = await db.transaction()
    try {
        const opportunity = await Opportunity.create(
            {
                title: String(os.subject || `OS #${os.id}`).slice(0, 160),
                notes: os.description || null,
                ClientId,
                SellerId: protocol?.SellerId ?? null,
                estimated_value: total > 0 ? total : null,
                kind: 'Serviço',
                stage,
                probability: STAGE_PROBABILITY[stage],
                stage_changed_at: new Date(),
                SourceServiceOrderId: os.id,
                billing_mode: protocol?.billing_mode || 'Direto',
                CommissionSupplierId: protocol?.CommissionSupplierId ?? null,
                commission_percent: protocol?.commission_percent ?? null,
                commission_value: protocol?.commission_manual ? protocol.commission_value : null,
                commission_manual: !!protocol?.commission_manual,
            },
            { transaction: t },
        )
        await OpportunityStageHistory.create({ OpportunityId: opportunity.id, from_stage: null, to_stage: stage }, { transaction: t })
        await t.commit()
        return opportunity
    } catch (e) {
        await t.rollback()
        throw e
    }
}

// Leva o desfecho da oportunidade para a OS de origem. Nunca lança: problemas viram warning (a etapa já mudou).
export async function syncSourceServiceOrder(opportunity: Opportunity, to: OpportunityStage, from?: OpportunityStage | null): Promise<{ warning?: string }> {
    if (!opportunity.SourceServiceOrderId) return {}
    const reopening = from === 'Perdido' && OPEN_STAGES.includes(to) && !!opportunity.source_os_prev_status
    if (!['Ganho', 'Perdido'].includes(to) && !reopening) return {}

    const os = await Service_order.findByPk(opportunity.SourceServiceOrderId)
    if (!os) return { warning: 'A OS de origem não existe mais.' }
    const protocol = await Protocol.findOne({ where: { ServiceOrderId: os.id } })

    // Reaberta depois de perdida: desfaz o cancelamento feito pelo CRM (OS volta ao status anterior, protocolo em aberto).
    if (reopening) {
        try {
            if (os.status === 'Cancelado') {
                if (protocol && protocol.status === 'Cancelado') await protocol.update({ status: 'Em aberto' })
                await os.update({ status: opportunity.source_os_prev_status as any })
            }
            await opportunity.update({ source_os_prev_status: null })
            return {}
        } catch (e: any) {
            console.error('[crm] falha ao reabrir a OS de origem', os.id, e)
            return { warning: `Oportunidade reaberta, mas a OS #${os.id} não foi reaberta: ${e.message}` }
        }
    }

    try {
        if (to === 'Ganho') {
            // Vendedor e cobrança definidos no CRM valem para o protocolo enquanto ele está em aberto.
            if (protocol && protocol.status === 'Em aberto') {
                const commission = await parseCommissionInput({
                    billing_mode: opportunity.billing_mode || 'Direto',
                    CommissionSupplierId: opportunity.CommissionSupplierId ?? null,
                    commission_percent: opportunity.commission_percent ?? '',
                    commission_value: opportunity.commission_manual ? opportunity.commission_value ?? '' : '',
                })
                await protocol.update({ SellerId: opportunity.SellerId ?? protocol.SellerId ?? null, ...(commission as any) })
            }
            await opportunity.update({ ServiceOrderId: os.id, ProtocolId: protocol?.id ?? null })
            if (os.status === 'Cancelado') return { warning: `Ganho registrado, mas a OS #${os.id} está cancelada: reabra a OS se for executar.` }
            if (PRE_EXECUTION.includes(os.status as string)) await os.update({ status: 'Na fila' })
            return {}
        }

        // Perdido: cancela protocolo e OS (o protocolo recusa se já houver recebimentos).
        if (['Finalizado', 'Cancelado'].includes(os.status as string)) return {}
        const previous = os.status as string
        if (protocol && protocol.status !== 'Cancelado') await protocol.update({ status: 'Cancelado' })
        await os.update({ status: 'Cancelado' })
        await opportunity.update({ source_os_prev_status: previous })
        return {}
    } catch (e: any) {
        console.error('[crm] falha ao atualizar a OS de origem', os.id, e)
        return {
            warning:
                to === 'Perdido'
                    ? `Perda registrada, mas a OS #${os.id} não foi cancelada: ${e.message}`
                    : `Ganho registrado, mas a OS #${os.id} não foi atualizada: ${e.message}`,
        }
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Duplicidade: clientes e leads que parecem ser a mesma pessoa/empresa (CNPJ/CPF, e-mail ou telefone).

const digitsOf = (v: any) => String(v || '').replace(/\D/g, '')
const emailOf = (v: any) => String(v || '').trim().toLowerCase()

export type MatchInput = { document?: string | null; email?: string | null; phone?: string | null; whatsapp?: string | null }
export type ClientMatch = { id: number; name: string; document: string | null; email: string | null; reason: 'documento' | 'e-mail' }
export type LeadMatch = { id: number; name: string; company: string | null; status: string; ClientId: number | null; reason: 'documento' | 'e-mail' | 'telefone' }

export async function findClientMatches(input: MatchInput): Promise<ClientMatch[]> {
    const doc = digitsOf(input.document)
    const email = emailOf(input.email)
    const found = new Map<number, ClientMatch>()

    if (doc.length >= 11) {
        for (const c of await Client.findAll({ where: { document: doc } }))
            found.set(c.id, { id: c.id, name: c.name, document: c.document ?? null, email: c.email ?? null, reason: 'documento' })
    }
    if (email) {
        const byEmail = await Client.findAll({ where: { email } as any })
        const contacts = await Contact.findAll({ where: { email } as any })
        const ids = new Set([...byEmail.map((c) => c.id), ...contacts.map((c) => c.ClientId as number).filter(Boolean)])
        for (const c of await Client.findAll({ where: { id: [...ids] } }))
            if (!found.has(c.id)) found.set(c.id, { id: c.id, name: c.name, document: c.document ?? null, email: c.email ?? null, reason: 'e-mail' })
    }
    return [...found.values()]
}

export async function findLeadMatches(input: MatchInput, excludeId?: number | null): Promise<LeadMatch[]> {
    const doc = digitsOf(input.document)
    const email = emailOf(input.email)
    const phones = [digitsOf(input.phone), digitsOf(input.whatsapp)].filter((p) => p.length >= 8)
    if (!doc && !email && !phones.length) return []

    const leads = await Lead.findAll({ where: excludeId ? { id: { [Op.ne]: excludeId } } : {} })
    const out: LeadMatch[] = []
    for (const l of leads) {
        let reason: LeadMatch['reason'] | null = null
        if (doc.length >= 11 && digitsOf(l.document) === doc) reason = 'documento'
        else if (email && emailOf(l.email) === email) reason = 'e-mail'
        else if (phones.some((p) => [digitsOf(l.phone), digitsOf(l.whatsapp)].some((q) => q && (q.endsWith(p) || p.endsWith(q)) && q.length >= 8)))
            reason = 'telefone'
        if (reason) out.push({ id: l.id, name: l.name, company: l.company ?? null, status: l.status as string, ClientId: l.ClientId ?? null, reason })
    }
    return out
}

// ---------------------------------------------------------------------------------------------------------------
// Valor real: o total do protocolo ligado à oportunidade (convertida ou vinda de OS) vale mais que a estimativa.

export async function protocolValues(opportunities: Opportunity[]): Promise<Map<number, number>> {
    const byProtocol = new Map<number, number>()
    const bySourceOs = new Map<number, number>()
    for (const o of opportunities) {
        if (o.ProtocolId) byProtocol.set(o.ProtocolId, o.id)
        else if (o.SourceServiceOrderId) bySourceOs.set(o.SourceServiceOrderId, o.id)
    }
    const result = new Map<number, number>()
    if (!byProtocol.size && !bySourceOs.size) return result

    const or: any[] = []
    if (byProtocol.size) or.push({ id: [...byProtocol.keys()] })
    if (bySourceOs.size) or.push({ ServiceOrderId: [...bySourceOs.keys()] })
    const protocols = await Protocol.findAll({ where: { [Op.or]: or }, include: ['Protocol_registers', 'Protocol_products'] })

    for (const p of protocols) {
        const oppId = byProtocol.get(p.id) ?? (p.ServiceOrderId ? bySourceOs.get(p.ServiceOrderId) : undefined)
        if (oppId === undefined) continue
        const total = summarizeProtocol(p).total_net
        if (total > 0) result.set(oppId, total)
    }
    return result
}

// Valor usado em telas e relatórios: do protocolo quando existe, senão o estimado.
export const realValue = (o: Opportunity, values: Map<number, number>) => values.get(o.id) ?? (Number(o.estimated_value) || 0)
