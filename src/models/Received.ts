import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'

import Protocol from './Protocol'

class Received extends Model<InferAttributes<Received>, InferCreationAttributes<Received>> {
    declare id: CreationOptional<number>
    declare method: 'Pix' | 'Boleto' | 'Cartão' | 'Transferência' | 'Espécie'
    declare value: number
    declare note: string

    declare protocolId: ForeignKey<Protocol['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Received.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        method: {
            type: DataTypes.ENUM,
            values: ['Pix', 'Boleto', 'Cartão', 'Transferência', 'Espécie'],
            allowNull: false,
        },
        value: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        note: {
            type: DataTypes.STRING,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'payments',
        sequelize: db,
    },
)

Received.hasOne(Protocol, {
    onDelete: 'RESTRICT',
})

export default Received
