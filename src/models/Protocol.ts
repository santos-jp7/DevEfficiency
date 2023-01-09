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
} from 'sequelize'

import db from '../db'

import Protocol_register from './Protocol_register'
import Receipts from './Receipts'
import Service_order from './Service_order'

class Protocol extends Model<InferAttributes<Protocol>, InferCreationAttributes<Protocol>> {
    declare id: CreationOptional<number>

    declare status: CreationOptional<'Em aberto' | 'Fechado'>

    declare serviceOrderId: ForeignKey<Service_order['id']>

    declare getProtocol_registers: HasManyGetAssociationsMixin<Protocol_register>
    declare createProtocol_register: HasManyCreateAssociationMixin<Protocol_register, 'protocolId'>

    declare getReceipts: HasManyGetAssociationsMixin<Receipts>
    declare createReceipt: HasManyCreateAssociationMixin<Receipts, 'protocolId'>

    declare static associations: {
        protocol_register: Association<Protocol, Protocol_register>
        receipts: Association<Protocol, Receipts>
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
            values: ['Em aberto', 'Fechado'],
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

Protocol.hasMany(Protocol_register)
Protocol.hasMany(Receipts)

export default Protocol
