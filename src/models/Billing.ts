import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    DataTypes,
    ForeignKey,
    NonAttribute,
    HasManyGetAssociationsMixin,
    HasManyCreateAssociationMixin,
    Association,
} from 'sequelize'
import db from '../db'
import Client from './Client'
import BillingProtocol from './BillingProtocol'

class Billing extends Model<InferAttributes<Billing>, InferCreationAttributes<Billing>> {
    declare id: CreationOptional<number>
    declare status: CreationOptional<string>
    declare total_value: CreationOptional<number>
    declare due_date: CreationOptional<Date>
    declare payment_date: CreationOptional<Date>
    declare method: CreationOptional<'Pix' | 'Boleto' | 'Cartão' | 'Transferência' | 'Espécie'>

    declare ClientId: ForeignKey<Client['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    declare BillingProtocols: NonAttribute<BillingProtocol[]>

    declare getBillingProtocols: HasManyGetAssociationsMixin<BillingProtocol>
    declare createBillingProtocol: HasManyCreateAssociationMixin<BillingProtocol, 'BillingId'>

    declare static associations: {
        billingProtocols: Association<Billing, BillingProtocol>
    }
}

Billing.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        status: {
            type: DataTypes.STRING(50),
            defaultValue: 'pendente', // pendente, pago, cancelado
        },
        total_value: {
            type: DataTypes.DECIMAL(10, 2),
            defaultValue: 0.0,
        },
        due_date: {
            type: DataTypes.DATE,
        },
        payment_date: {
            type: DataTypes.DATE,
        },
        method: {
            type: DataTypes.ENUM,
            values: ['Pix', 'Boleto', 'Cartão', 'Transferência', 'Espécie'],
            allowNull: false,
            defaultValue: 'Boleto',
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'billings',
        sequelize: db,
    },
)

Billing.hasMany(BillingProtocol, {
    onDelete: 'CASCADE',
})
BillingProtocol.belongsTo(Billing)

import billingHooks from '../hooks/billingHooks'

Billing.afterUpdate(billingHooks.afterUpdate)

export default Billing
