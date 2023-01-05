import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'

import Protocol from './Protocol'

class ProtocolRegister extends Model<InferAttributes<ProtocolRegister>, InferCreationAttributes<ProtocolRegister>> {
    declare id: CreationOptional<number>

    declare description: string
    declare value: number

    declare type: 'Serviço' | 'Despesa'

    declare protocolId: ForeignKey<Protocol['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

ProtocolRegister.init(
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

ProtocolRegister.hasOne(Protocol, {
    onDelete: 'RESTRICT',
})

export default ProtocolRegister
