import { Op, Transaction } from 'sequelize'

import Opportunity, { LOST_REASONS, OPPORTUNITY_STAGES, OpportunityStage, STAGE_PROBABILITY } from '../models/Opportunity'
import OpportunityStageHistory from '../models/OpportunityStageHistory'
import CrmActivity from '../models/CrmActivity'

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
