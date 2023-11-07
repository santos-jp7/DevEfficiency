import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    DataTypes,
    HasManyGetAssociationsMixin,
    HasManyCreateAssociationMixin,
    Association,
    NonAttribute,
} from 'sequelize'

import moment from 'moment'

import db from '../db'

import Protocol_product from './Protocol_product'
import Protocol_register from './Protocol_register'
import Receipts from './Receipts'
import Service_order from './Service_order'
import Subscription from './Subscription'

class Protocol extends Model<InferAttributes<Protocol>, InferCreationAttributes<Protocol>> {
    declare id: CreationOptional<number>

    declare status: CreationOptional<'Em aberto' | 'Liberado para pagamento' | 'Fechado' | 'Cancelado'>

    declare ServiceOrderId: ForeignKey<Service_order['id']>
    declare SubscriptionId: ForeignKey<Subscription['id']>

    declare getProtocol_registers: HasManyGetAssociationsMixin<Protocol_register>
    declare createProtocol_register: HasManyCreateAssociationMixin<Protocol_register, 'ProtocolId'>

    declare getProtocol_products: HasManyGetAssociationsMixin<Protocol_product>
    declare createProtocol_product: HasManyCreateAssociationMixin<Protocol_product, 'ProtocolId'>

    declare getReceipts: HasManyGetAssociationsMixin<Receipts>
    declare createReceipt: HasManyCreateAssociationMixin<Receipts, 'ProtocolId'>

    declare Protocol_registers: NonAttribute<Protocol_register[]>
    declare Protocol_products: NonAttribute<Protocol_product[]>
    declare Receipts: NonAttribute<Receipts[]>

    declare static associations: {
        Protocol_registers: Association<Protocol, Protocol_register>
        Protocol_products: Association<Protocol, Protocol_product>
        Receipts: Association<Protocol, Receipts>
    }

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Protocol.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        status: {
            type: DataTypes.ENUM,
            values: ['Em aberto', 'Liberado para pagamento', 'Fechado', 'Cancelado'],
            defaultValue: 'Em aberto',
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'protocols',
        sequelize: db,
    },
)

Subscription.hasMany(Protocol, {
    onDelete: 'RESTRICT',
})
Protocol.belongsTo(Subscription)

Protocol.hasMany(Protocol_register, {
    onDelete: 'RESTRICT',
})

Protocol.hasMany(Protocol_product, {
    onDelete: 'RESTRICT',
})

Protocol.hasMany(Receipts, {
    onDelete: 'RESTRICT',
})

Protocol.beforeSave(async (protocol) => {
    const service_order = protocol?.ServiceOrderId ? await Service_order.findByPk(protocol.ServiceOrderId) : false
    const subscription = protocol?.SubscriptionId ? await Subscription.findByPk(protocol.SubscriptionId) : false

    console.log('protocolllll')
    console.log(protocol)

    const protocol_products = await protocol?.getProtocol_products()
    const protocol_registers = await protocol?.getProtocol_registers()

    const receipts = await protocol?.getReceipts()

    const total_cost =
        (protocol_registers?.reduce((sum, v) => sum + v.value, 0) || 0) +
        (protocol_products?.reduce((sum, v) => sum + v.value, 0) || 0)

    const total_receipt = receipts?.reduce((sum, v) => sum + v.value, 0) || 0

    if (protocol.status == 'Fechado') {
        if (total_receipt < total_cost)
            throw new Error('Não é possivel finalizar, protocolo com recebimentos pendentes.')

        if (service_order && !subscription) {
            let charge_type: Protocol_product['charge_type'] | false = false

            if (protocol_products.find((v) => v.charge_type == 'Mensal')) charge_type = 'Mensal'
            if (protocol_products.find((v) => v.charge_type == 'Anual')) charge_type = 'Anual'

            if (charge_type) {
                let dueAt: Date | false = false

                if (charge_type == 'Mensal') dueAt = moment().add(30, 'days').toDate()
                if (charge_type == 'Anual') dueAt = moment().add(365, 'days').toDate()

                if (!dueAt) throw new Error('Não foi possivel criar assinatura. Divergência com tipos de cobranças.')

                const subscription = await Subscription.create({
                    dueAt,
                    ClientId: service_order.ClientId,
                    ProjectId: service_order.ProjectId,
                })

                protocol.SubscriptionId = subscription.id

                for await (let protocol_product of protocol_products) {
                    if (!protocol_product.LicenseId) continue

                    const license = await protocol_product.getLicense()

                    license.SubscriptionId = subscription.id

                    await license.save()
                }
            }
        }
    }

    if (protocol.status == 'Cancelado') {
        if (total_receipt > 0) throw new Error('Não é possivel finalizar, protocolo com recebimentos.')
    }
})

export default Protocol
