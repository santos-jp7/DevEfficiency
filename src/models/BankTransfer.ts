import { Model, InferAttributes, InferCreationAttributes, CreationOptional, DataTypes, ForeignKey } from 'sequelize'
import db from '../db'

import BankAccount from './BankAccount'

class BankTransfer extends Model<InferAttributes<BankTransfer>, InferCreationAttributes<BankTransfer>> {
    declare id: CreationOptional<number>
    declare sourceAccountId: ForeignKey<BankAccount['id']>
    declare destinationAccountId: ForeignKey<BankAccount['id']>
    declare amount: number
    declare date: Date

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

BankTransfer.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        sourceAccountId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: BankAccount,
                key: 'id',
            },
        },
        destinationAccountId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: BankAccount,
                key: 'id',
            },
        },
        amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        date: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'bank_transfers',
        sequelize: db,
    },
)

export default BankTransfer
