import { Model, InferAttributes, InferCreationAttributes, CreationOptional, DataTypes, ForeignKey } from 'sequelize'

import db from '../db'
import CostCenter from './CostCenter'

export type SellerAppliesTo = 'ambos' | 'servicos' | 'produtos'
export type SellerBase = 'liquido' | 'bruto'

const decimal = (field: string) => ({
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    get(this: any) {
        const v = this.getDataValue(field)
        return v === null || v === undefined ? null : Number(v)
    },
})

class Seller extends Model<InferAttributes<Seller>, InferCreationAttributes<Seller>> {
    declare id: CreationOptional<number>
    declare name: string
    declare document: CreationOptional<string | null>
    declare email: CreationOptional<string | null>
    declare phone: CreationOptional<string | null>
    declare pix_key: CreationOptional<string | null>
    declare notes: CreationOptional<string | null>
    declare active: CreationOptional<boolean>

    // Regras de comissão
    declare commission_percent: number
    declare commission_base: CreationOptional<SellerBase>
    declare applies_to: CreationOptional<SellerAppliesTo>
    declare min_protocol_value: CreationOptional<number | null>
    declare payment_delay_days: CreationOptional<number>

    declare CostCenterId: CreationOptional<ForeignKey<CostCenter['id']> | null>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Seller.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        name: { type: DataTypes.STRING(128), allowNull: false },
        document: { type: DataTypes.STRING(20), allowNull: true },
        email: { type: DataTypes.STRING(128), allowNull: true },
        phone: { type: DataTypes.STRING(20), allowNull: true },
        pix_key: { type: DataTypes.STRING(128), allowNull: true },
        notes: { type: DataTypes.TEXT, allowNull: true },
        active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        commission_percent: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 0,
            get() {
                return Number(this.getDataValue('commission_percent')) || 0
            },
        },
        commission_base: {
            type: DataTypes.ENUM('liquido', 'bruto'),
            allowNull: false,
            defaultValue: 'liquido',
        },
        applies_to: {
            type: DataTypes.ENUM('ambos', 'servicos', 'produtos'),
            allowNull: false,
            defaultValue: 'ambos',
        },
        min_protocol_value: decimal('min_protocol_value'),
        payment_delay_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'sellers',
        sequelize: db,
    },
)

Seller.belongsTo(CostCenter)

export default Seller
