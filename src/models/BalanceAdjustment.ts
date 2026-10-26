import { Model, InferAttributes, InferCreationAttributes, CreationOptional, DataTypes, ForeignKey } from 'sequelize'

import db from '../db'
import BankAccount from './BankAccount'

// Trilha de auditoria de toda correção manual de saldo / definição de saldo inicial.
class BalanceAdjustment extends Model<InferAttributes<BalanceAdjustment>, InferCreationAttributes<BalanceAdjustment>> {
    declare id: CreationOptional<number>
    declare kind: 'saldo_inicial' | 'correcao_saldo'
    declare previous_value: CreationOptional<number | null>
    declare new_value: number
    declare reason: CreationOptional<string | null>
    declare user: CreationOptional<string | null>

    declare BankAccountId: ForeignKey<BankAccount['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

BalanceAdjustment.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        kind: { type: DataTypes.ENUM('saldo_inicial', 'correcao_saldo'), allowNull: false },
        previous_value: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
        new_value: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
        reason: { type: DataTypes.STRING(255), allowNull: true },
        user: { type: DataTypes.STRING(128), allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    { tableName: 'balance_adjustments', sequelize: db },
)

BalanceAdjustment.belongsTo(BankAccount)
BankAccount.hasMany(BalanceAdjustment)

export default BalanceAdjustment
