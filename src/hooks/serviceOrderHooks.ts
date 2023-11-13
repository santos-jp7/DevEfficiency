import Service_order from '../models/Service_order'

class serviceOrderHooks {
    static async beforeSave(service_order: Service_order) {
        if (service_order.status == 'Em correções') {
            const current_os = await Service_order.findOne({ where: { status: 'Em correções' } })

            if (current_os)
                if (current_os.id != service_order.id)
                    throw new Error(`Já possuimos uma Os em correções (Os #${current_os.id}).`)
        }
    }
}

export default serviceOrderHooks
