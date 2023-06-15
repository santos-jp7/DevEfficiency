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

import db from '../db'
import Protocol_product from './Protocol_product'

import Protocol_register from './Protocol_register'
import Receipts from './Receipts'
import Service_order from './Service_order'

class Protocol extends Model<InferAttributes<Protocol>, InferCreationAttributes<Protocol>> {
    declare id: CreationOptional<number>

    declare status: CreationOptional<'Em aberto' | 'Liberado para pagamento' | 'Fechado'>

    declare serviceOrderId: ForeignKey<Service_order['id']>

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
            values: ['Em aberto', 'Liberado para pagamento', 'Fechado'],
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

Protocol.hasMany(Protocol_register, {
    onDelete: 'RESTRICT',
})

Protocol.hasMany(Protocol_product, {
    onDelete: 'RESTRICT',
})

Protocol.hasMany(Receipts, {
    onDelete: 'RESTRICT',
})

export default Protocol
