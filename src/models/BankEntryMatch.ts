import { Model, InferAttributes, InferCreationAttributes, CreationOptional, DataTypes, ForeignKey } from 'sequelize'

import db from '../db'
import BankStatementEntry from './BankStatementEntry'

// Vínculos entre uma linha do extrato e lançamentos do sistema. Uma linha pode ter vários (ex.: um PIX que pagou
// duas faturas) e uma transferência entre contas é vinculada uma vez em cada conta (saída e entrada).
class BankEntryMatch extends Model<InferAttributes<BankEntryMatch>, InferCreationAttributes<BankEntryMatch>> {
    declare id: CreationOptional<number>
    declare target_type: 'billing' | 'receipt' | 'payable' | 'transfer'
    declare target_id: number
    declare value: number

    declare BankStatementEntryId: ForeignKey<BankStatementEntry['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

BankEntryMatch.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        target_type: { type: DataTypes.ENUM('billing', 'receipt', 'payable', 'transfer'), allowNull: false },
        target_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        value: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            get() {
                return Number(this.getDataValue('value'))
            },
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'bank_entry_matches',
        sequelize: db,
        indexes: [{ name: 'idx_bank_entry_match_target', fields: ['target_type', 'target_id'] }],
    },
)

BankEntryMatch.belongsTo(BankStatementEntry, { onDelete: 'CASCADE' })
BankStatementEntry.hasMany(BankEntryMatch, { onDelete: 'CASCADE' })

export default BankEntryMatch
