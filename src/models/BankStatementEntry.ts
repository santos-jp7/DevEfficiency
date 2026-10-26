import { Model, InferAttributes, InferCreationAttributes, CreationOptional, DataTypes, ForeignKey } from 'sequelize'

import db from '../db'
import BankAccount from './BankAccount'
import BankStatementImport from './BankStatementImport'

export type EntryStatus = 'pendente' | 'conciliado' | 'ignorado'
export type MatchType = 'billing' | 'receipt' | 'payable' | 'transfer'

class BankStatementEntry extends Model<InferAttributes<BankStatementEntry>, InferCreationAttributes<BankStatementEntry>> {
    declare id: CreationOptional<number>

    // Chave de deduplicação (por conta). Reimportar o mesmo lançamento gera a mesma chave e é ignorado.
    declare dedupe_key: string
    declare external_id: CreationOptional<string | null>

    declare date: string
    // Com sinal: entrada > 0, saída < 0.
    declare amount: number
    declare description: CreationOptional<string | null>

    declare status: CreationOptional<EntryStatus>
    declare matched_type: CreationOptional<MatchType | null>
    declare matched_id: CreationOptional<number | null>
    declare matched_at: CreationOptional<Date | null>
    // Diferença aceita ao conciliar (extrato − soma dos lançamentos), ex.: tarifa descontada do depósito.
    declare match_difference: CreationOptional<number | null>

    declare BankAccountId: ForeignKey<BankAccount['id']>
    declare BankStatementImportId: CreationOptional<ForeignKey<BankStatementImport['id']>>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

BankStatementEntry.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        dedupe_key: { type: DataTypes.STRING(64), allowNull: false },
        external_id: { type: DataTypes.STRING(128), allowNull: true },
        date: { type: DataTypes.DATEONLY, allowNull: false },
        amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            get() {
                return Number(this.getDataValue('amount'))
            },
        },
        description: { type: DataTypes.STRING(512), allowNull: true },
        status: {
            type: DataTypes.ENUM('pendente', 'conciliado', 'ignorado'),
            allowNull: false,
            defaultValue: 'pendente',
        },
        matched_type: { type: DataTypes.ENUM('billing', 'receipt', 'payable', 'transfer'), allowNull: true },
        matched_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        matched_at: { type: DataTypes.DATE, allowNull: true },
        match_difference: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            get() {
                const v = this.getDataValue('match_difference')
                return v === null || v === undefined ? null : Number(v)
            },
        },
        BankAccountId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'bank_statement_entries',
        sequelize: db,
        indexes: [
            // Garante no banco que o mesmo lançamento não entra duas vezes, mesmo com importações simultâneas.
            { unique: true, name: 'uq_bank_entry_dedupe', fields: ['BankAccountId', 'dedupe_key'] },
            { name: 'idx_bank_entry_match', fields: ['matched_type', 'matched_id'] },
        ],
    },
)

BankStatementEntry.belongsTo(BankAccount)
BankAccount.hasMany(BankStatementEntry)

BankStatementEntry.belongsTo(BankStatementImport)
BankStatementImport.hasMany(BankStatementEntry)

export default BankStatementEntry
