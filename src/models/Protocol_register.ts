import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'

import Protocol from './Protocol'

class Protocol_register extends Model<InferAttributes<Protocol_register>, InferCreationAttributes<Protocol_register>> {
    declare id: CreationOptional<number>

    declare description: string
    declare value: number

    declare type: 'Serviço' | 'Despesa'

    declare protocolId: ForeignKey<Protocol['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Protocol_register.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        description: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        value: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM,
            values: ['Entrada', 'Saída'],
            allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'protocol_registers',
        sequelize: db,
    },
)

Protocol_register.hasOne(Protocol, {
    onDelete: 'RESTRICT',
})

export default Protocol_register
