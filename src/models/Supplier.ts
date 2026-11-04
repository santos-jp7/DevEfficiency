import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    DataTypes,
} from 'sequelize'
import db from '../db'

class Supplier extends Model<InferAttributes<Supplier>, InferCreationAttributes<Supplier>> {
    declare id: CreationOptional<number>
    declare name: string
    declare cnpj: CreationOptional<string>
    declare email: CreationOptional<string>
    declare phone: CreationOptional<string>
    // Protocolos por comissão: % sugerida e prazo (dias) para vencimento da cobrança ao fornecedor.
    declare default_commission_percent: CreationOptional<number | null>
    declare commission_payment_days: CreationOptional<number>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Supplier.init(
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
        cnpj: {
            type: DataTypes.STRING(20),
            unique: true,
            allowNull: true,
        },
        email: {
            type: DataTypes.STRING(128),
            allowNull: true,
        },
        phone: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        default_commission_percent: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: true,
            get() {
                const v = this.getDataValue('default_commission_percent')
                return v === null || v === undefined ? null : Number(v)
            },
        },
        commission_payment_days: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 30,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'suppliers',
        sequelize: db,
    },
)

export default Supplier
