import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'

import ServiceOrder from './ServiceOrder'

class Protocol extends Model<InferAttributes<Protocol>, InferCreationAttributes<Protocol>> {
    declare id: CreationOptional<number>

    declare status: CreationOptional<'Em aberto' | 'Fechado'>

    declare serviceOrderId: ForeignKey<ServiceOrder['id']>

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

Protocol.hasOne(ServiceOrder, {
    onDelete: 'RESTRICT',
})

export default Protocol
