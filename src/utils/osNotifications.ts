import moment from 'moment'

import Service_order from '../models/Service_order'
import Client from '../models/Client'
import Project from '../models/Project'
import { emailLayout, esc, infoBox } from './emailTemplates'
import { clientRecipients, isEnabled, sendClientEmail } from './clientMail'

type Stage = { title: string; subject: string; message: string; accent?: string }

const STAGES: Record<string, Stage> = {
    aberta: {
        title: 'Recebemos sua solicitação',
        subject: 'Ordem de serviço aberta',
        message: 'Registramos sua solicitação e ela já está em avaliação pela nossa equipe. Avisaremos a cada nova etapa.',
    },
    'Em avaliação': {
        title: 'Solicitação em avaliação',
        subject: 'Em avaliação',
        message: 'Sua solicitação está em avaliação pela nossa equipe.',
    },
    'Orçamento enviado': {
        title: 'Orçamento disponível',
        subject: 'Orçamento enviado',
        message: 'O orçamento da sua solicitação foi enviado. Assim que for aprovado, daremos andamento ao atendimento.',
    },
    'Na fila': {
        title: 'Solicitação aprovada e na fila',
        subject: 'Na fila de atendimento',
        message: 'Sua solicitação está aprovada e entrou na fila de atendimento. Iniciaremos assim que chegar a vez.',
    },
    'Em correções': {
        title: 'Atendimento iniciado',
        subject: 'Em andamento',
        message: 'Iniciamos o atendimento da sua solicitação. Ela está em andamento pela nossa equipe.',
    },
    Pendente: {
        title: 'Solicitação pendente',
        subject: 'Pendente',
        message: 'Sua solicitação está pendente de uma informação ou ação. Se precisarmos de algo de você, entraremos em contato.',
        accent: '#d68910',
    },
    Finalizado: {
        title: 'Solicitação finalizada',
        subject: 'Finalizada',
        message: 'Concluímos o atendimento da sua solicitação. Se algo não estiver como esperado, é só responder este e-mail.',
        accent: '#1e8449',
    },
    Cancelado: {
        title: 'Solicitação cancelada',
        subject: 'Cancelada',
        message: 'Esta solicitação foi cancelada. Em caso de dúvidas, é só responder este e-mail.',
        accent: '#7f8c8d',
    },
}

// Avisa o cliente de uma etapa da OS (abertura ou mudança de status). Não lança e não bloqueia quem chama.
export async function notifyOsStage(osId: number, stageName: string): Promise<void> {
    try {
        const stage = STAGES[stageName]
        if (!stage || !(await isEnabled('os_email_enabled'))) return

        const os = await Service_order.findByPk(osId, { include: [Client, { model: Project, include: [Client] }] })
        if (!os || !os.notify_client) return

        const client = (os as any).Client || (os as any).Project?.Client
        const name = client?.corporate_name || client?.name || ''

        const body = `
            <p>${esc(stage.message)}</p>
            ${infoBox([
                ['Ordem de serviço', `#${os.id}`],
                ['Assunto', os.subject],
                ['Projeto', (os as any).Project?.name || ''],
                ['Situação', stageName === 'aberta' ? 'Em avaliação' : stageName],
                ['Prazo previsto', os.prazo ? moment(os.prazo).format('DD/MM/YYYY') : ''],
            ])}`

        await sendClientEmail({
            kind: 'os_stage',
            refType: 'service_order',
            refId: os.id,
            stage: `${stageName}@${Date.now()}`,
            to: await clientRecipients(os.ClientId || client?.id),
            subject: `OS #${os.id} — ${stage.subject}: ${os.subject}`.slice(0, 250),
            html: emailLayout({ title: stage.title, greeting: `Olá, ${name}!`, body, accent: stage.accent }),
        })
    } catch (err) {
        console.error(`[os] falha ao notificar etapa "${stageName}" da OS #${osId}`, err)
    }
}
