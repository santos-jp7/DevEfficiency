import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    DataTypes,
    ForeignKey,
    NonAttribute,
    Association,
} from 'sequelize'
import db from '../db'

import Protocol from './Protocol'
import Billing from './Billing'

class BillingProtocol extends Model<InferAttributes<BillingProtocol>, InferCreationAttributes<BillingProtocol>> {
    declare id: CreationOptional<number>
    declare value: CreationOptional<number>

    declare BillingId: ForeignKey<Billing['id']>
    declare ProtocolId: ForeignKey<Protocol['id']>
    // Parcela cobrada (condição de pagamento) e quanto dela entrou na baixa (baixa parcial de repasse de fornecedor).
    declare ProtocolInstallmentId: CreationOptional<ForeignKey<number> | null>
    declare received_value: CreationOptional<number | null>

    declare Protocol: NonAttribute<Protocol>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    declare static associations: {
        Billing: Association<BillingProtocol, Billing>
        Protocol: Association<BillingProtocol, Protocol>
    }
}

BillingProtocol.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        value: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        received_value: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            get(this: any) {
                const v = this.getDataValue('received_value')
                return v === null || v === undefined ? null : Number(v)
            },
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'billing_protocols',
        sequelize: db,
    },
)

export default BillingProtocol
