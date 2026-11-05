import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'
import type Protocol from './Protocol'

const money = (field: string) => ({
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    get(this: any) {
        return Number(this.getDataValue(field)) || 0
    },
})

// Parcela da condição de pagamento do protocolo (ex.: 15/30/60). Cada parcela vira uma cobrança com o seu vencimento.
class ProtocolInstallment extends Model<InferAttributes<ProtocolInstallment>, InferCreationAttributes<ProtocolInstallment>> {
    declare id: CreationOptional<number>
    declare number: number
    declare due_date: string
    declare value: number
    declare paid_value: CreationOptional<number>
    declare status: CreationOptional<'pendente' | 'pago' | 'cancelado'>

    declare ProtocolId: ForeignKey<Protocol['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

ProtocolInstallment.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        number: { type: DataTypes.INTEGER, allowNull: false },
        due_date: { type: DataTypes.DATEONLY, allowNull: false },
        value: money('value'),
        paid_value: money('paid_value'),
        status: { type: DataTypes.ENUM('pendente', 'pago', 'cancelado'), allowNull: false, defaultValue: 'pendente' },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    { tableName: 'protocol_installments', sequelize: db },
)

// Associações em Protocol.ts (evita import circular entre modelos e hooks).

export default ProtocolInstallment
