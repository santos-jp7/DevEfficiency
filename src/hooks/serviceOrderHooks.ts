import Service_order from '../models/Service_order'
import { notifyOsStage } from '../utils/osNotifications'

// Dispara depois do commit quando há transação; senão imediatamente. Fire-and-forget: a resposta da API não espera o e-mail.
function afterCommit(options: any, fn: () => void) {
    if (options?.transaction?.afterCommit) options.transaction.afterCommit(fn)
    else fn()
}

class serviceOrderHooks {
    static async beforeSave(service_order: Service_order) {
        if (service_order.status == 'Em correções') {
            const current_os = await Service_order.findOne({ where: { status: 'Em correções' } })

            if (current_os)
                if (current_os.id != service_order.id)
                    throw new Error(`Já possuimos uma Os em correções (Os #${current_os.id}).`)
        }
    }

    static async afterCreate(service_order: Service_order, options: any) {
        afterCommit(options, () => void notifyOsStage(service_order.id, 'aberta'))
    }

    static async afterUpdate(service_order: Service_order, options: any) {
        const status = service_order.status
        if (service_order.previous('status') === status) return

        afterCommit(options, () => void notifyOsStage(service_order.id, status as string))

        // Chamado de origem acompanha o desfecho da OS (o cliente já é avisado pelo e-mail da própria OS).
        if (status === 'Finalizado' || status === 'Cancelado') {
            const { default: Ticket } = await import('../models/Ticket')
            await Ticket.update(
                { status: status === 'Finalizado' ? 'Resolvido' : 'Cancelado', resolvedAt: new Date() },
                { where: { ServiceOrderId: service_order.id, status: 'Convertido em OS' } },
            )
        }
    }
}

export default serviceOrderHooks
