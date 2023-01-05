import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'

import Protocol from './Protocol'

class Receipts extends Model<InferAttributes<Receipts>, InferCreationAttributes<Receipts>> {
    declare id: CreationOptional<number>
    declare method: 'Pix' | 'Boleto' | 'Cartão' | 'Transferência' | 'Espécie'
    declare value: number
    declare note: string

    declare protocolId: ForeignKey<Protocol['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Receipts.init(
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
        tableName: 'receipts',
        sequelize: db,
    },
)

export default Receipts
