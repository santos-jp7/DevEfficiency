import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    DataTypes,
    ForeignKey,
} from 'sequelize'
import db from '../db'
import Billing from './Billing'

class BillingFile extends Model<InferAttributes<BillingFile>, InferCreationAttributes<BillingFile>> {
    declare id: CreationOptional<number>
    declare type: 'boleto' | 'nota_fiscal'
    declare filename: string
    declare url: string

    declare BillingId: ForeignKey<Billing['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

BillingFile.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        type: {
            type: DataTypes.ENUM('boleto', 'nota_fiscal'),
            allowNull: false,
        },
        filename: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        url: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'billing_files',
        sequelize: db,
    },
)

Billing.hasMany(BillingFile, { onDelete: 'CASCADE' })
BillingFile.belongsTo(Billing)

export default BillingFile
