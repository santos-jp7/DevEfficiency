import { Model, InferAttributes, InferCreationAttributes, CreationOptional, DataTypes } from 'sequelize'
import db from '../db'

import BankTransfer from './BankTransfer'

class BankAccount extends Model<InferAttributes<BankAccount>, InferCreationAttributes<BankAccount>> {
    declare id: CreationOptional<number>
    declare name: string
    declare bank: CreationOptional<string>
    declare agency: CreationOptional<string>
    declare accountNumber: CreationOptional<string>
    declare balance: CreationOptional<number>
    declare iban: CreationOptional<string>
    declare swiftCode: CreationOptional<string>
    declare bankAddress: CreationOptional<string>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

BankAccount.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(128),
            allowNull: false,
        },
        bank: {
            type: DataTypes.STRING(128),
            allowNull: true,
        },
        agency: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        accountNumber: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        balance: {
            type: DataTypes.FLOAT,
            defaultValue: 0.0,
            allowNull: false,
        },
        iban: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        swiftCode: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        bankAddress: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'bank_accounts',
        sequelize: db,
    },
)

BankAccount.hasMany(BankTransfer, { as: 'SentTransfers', foreignKey: 'sourceAccountId' })
BankAccount.hasMany(BankTransfer, { as: 'ReceivedTransfers', foreignKey: 'destinationAccountId' })

BankTransfer.belongsTo(BankAccount, { as: 'SourceAccount', foreignKey: 'sourceAccountId' })
BankTransfer.belongsTo(BankAccount, { as: 'DestinationAccount', foreignKey: 'destinationAccountId' })

export default BankAccount
