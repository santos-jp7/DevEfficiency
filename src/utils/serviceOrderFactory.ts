import Project from '../models/Project'
import Service_order from '../models/Service_order'
import SlaLevel from '../models/SlaLevel'
import ClientSlaConfig from '../models/ClientSlaConfig'

export type NewServiceOrder = {
    subject: string
    description?: string | null
    ProjectId?: number | null
    ClientId?: number | null
    SlaLevelId?: number | null
    gravidade?: 'Crítico' | 'Alto' | 'Médio' | 'Baixo' | null
    prazo?: string | Date | null
    notify_client?: boolean
}

// Cria a OS com protocolo e prazos de SLA. Usada pelo cadastro de OS e pela conversão de chamados.
export async function createServiceOrder(input: NewServiceOrder): Promise<Service_order> {
    const { subject, description, ProjectId, ClientId, SlaLevelId, gravidade, prazo, notify_client } = input

    const project = ProjectId ? await Project.findByPk(ProjectId) : undefined
    const resolvedClientId = project?.ClientId ?? ClientId ?? null

    const os = await Service_order.create({
        subject,
        description,
        ProjectId,
        ClientId: resolvedClientId,
        gravidade: gravidade || null,
        prazo: prazo ? new Date(prazo) : null,
        ...(notify_client === undefined ? {} : { notify_client }),
    } as any)

    await os.createProtocol()

    const updatePayload: any = {}

    if (gravidade && resolvedClientId) {
        const slaConfig = await ClientSlaConfig.findOne({ where: { ClientId: resolvedClientId, gravidade } })
        if (slaConfig && os.createdAt) {
            const base = new Date(os.createdAt)
            updatePayload.sla_response_deadline = new Date(base.getTime() + slaConfig.response_hours * 3600000)
            updatePayload.sla_solution_deadline = new Date(base.getTime() + slaConfig.solution_hours * 3600000)
        }
    } else if (SlaLevelId) {
        const slaLevel = await SlaLevel.findByPk(SlaLevelId)
        if (slaLevel && os.createdAt) {
            const base = new Date(os.createdAt)
            updatePayload.SlaLevelId = SlaLevelId
            updatePayload.sla_response_deadline = new Date(base.getTime() + slaLevel.response_hours * 3600000)
            updatePayload.sla_solution_deadline = new Date(base.getTime() + slaLevel.solution_hours * 3600000)
        }
    }

    if (Object.keys(updatePayload).length > 0) await os.update(updatePayload)

    return os
}
