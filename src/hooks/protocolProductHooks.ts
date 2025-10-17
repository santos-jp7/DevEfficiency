import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'

class protocolProductHooks {
    static async beforeSave(protocol_product: Protocol_product) {
        const protocol = await Protocol.findByPk(protocol_product.ProtocolId)

        const protocol_products = await protocol?.getProtocol_products()

        if (protocol_product.charge_type != 'Único') {
            const find = protocol_product.charge_type == 'Mensal' ? 'Anual' : 'Mensal'

            if (protocol_products?.find((v) => v.charge_type == find))
                throw new Error(`Não é possivel salvar. Produto com tipo ${find.toLowerCase()} já cadastrado.`)
        }
    }

    static async afterCreate(protocol_product: Protocol_product) {
        const protocol = await Protocol.findByPk(protocol_product.ProtocolId)

        if (protocol && protocol.status === 'Liberado para pagamento') {
            await protocol.update({ status: 'Em aberto' })
        }
    }
}

export default protocolProductHooks
