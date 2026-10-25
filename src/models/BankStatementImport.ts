import { Model, InferAttributes, InferCreationAttributes, CreationOptional, DataTypes, ForeignKey } from 'sequelize'

import db from '../db'
import BankAccount from './BankAccount'

class BankStatementImport extends Model<
    InferAttributes<BankStatementImport>,
    InferCreationAttributes<BankStatementImport>
> {
    declare id: CreationOptional<number>
    declare filename: string
    declare format: 'ofx' | 'csv'
    declare file_hash: string

    declare total_entries: number
    declare inserted_entries: number
    declare duplicate_entries: number
    declare period_start: CreationOptional<string | null>
    declare period_end: CreationOptional<string | null>

    declare BankAccountId: ForeignKey<BankAccount['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

BankStatementImport.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        filename: { type: DataTypes.STRING(255), allowNull: false },
        format: { type: DataTypes.ENUM('ofx', 'csv'), allowNull: false },
        file_hash: { type: DataTypes.STRING(64), allowNull: false },
        total_entries: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        inserted_entries: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        duplicate_entries: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        period_start: { type: DataTypes.DATEONLY, allowNull: true },
        period_end: { type: DataTypes.DATEONLY, allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'bank_statement_imports',
        sequelize: db,
    },
)

BankStatementImport.belongsTo(BankAccount)
BankAccount.hasMany(BankStatementImport)

export default BankStatementImport
