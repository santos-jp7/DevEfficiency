import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    DataTypes,
    Association,
} from 'sequelize'

import db from '../db'

import Protocol from './Protocol'
import BankAccount from './BankAccount'

class Receipts extends Model<InferAttributes<Receipts>, InferCreationAttributes<Receipts>> {
    declare id: CreationOptional<number>
    declare method: 'Pix' | 'Boleto' | 'Cartão' | 'Transferência' | 'Espécie'
    declare value: number
    declare note: string

    declare ProtocolId: ForeignKey<Protocol['id']>
    declare BankAccountId: ForeignKey<BankAccount['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    declare static associations: {
        Protocol?: Association<Receipts, Protocol>
        BankAccount?: Association<Receipts, BankAccount>
    }
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

import receiptHooks from '../hooks/receiptHooks'

Receipts.belongsTo(BankAccount)

BankAccount.hasMany(Receipts)

// Hooks
Receipts.afterCreate(receiptHooks.afterCreate)
Receipts.afterUpdate(receiptHooks.afterUpdate)
Receipts.afterDestroy(receiptHooks.afterDestroy)

export default Receipts
