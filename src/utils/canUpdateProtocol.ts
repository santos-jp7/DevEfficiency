import Protocol from '../models/Protocol'

export default async function canUpdateProtocol(status: Protocol['status'], protocol: Protocol): Promise<boolean> {
    if (status == 'Fechado') {
        const total_cost =
            ((await protocol?.getProtocol_registers())?.reduce((sum, v) => sum + v.value, 0) || 0) +
            ((await protocol?.getProtocol_products())?.reduce((sum, v) => sum + v.value, 0) || 0)

        const total_receipt = (await protocol?.getReceipts())?.reduce((sum, v) => sum + v.value, 0) || 0

        if (total_receipt < total_cost)
            throw new Error('Não é possivel finalizar, protocolo com recebimentos pendentes.')
    }

    if (status == 'Cancelado') {
        const total_receipt = (await protocol?.getReceipts())?.reduce((sum, v) => sum + v.value, 0) || 0

        if (total_receipt > 0) throw new Error('Não é possivel finalizar, protocolo com recebimentos.')
    }

    return true
}
