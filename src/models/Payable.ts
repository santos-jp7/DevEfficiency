import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    DataTypes,
    ForeignKey,
} from 'sequelize'
import db from '../db'
import Supplier from './Supplier'
import BankAccount from './BankAccount'
import CostCenter from './CostCenter'

class Payable extends Model<InferAttributes<Payable>, InferCreationAttributes<Payable>> {
    declare id: CreationOptional<number>
    declare description: string
    declare value: number
    declare dueDate: Date
    declare paymentDate: CreationOptional<Date>
    declare status: CreationOptional<'pendente' | 'pago' | 'atrasado' | 'cancelado'>

    declare SupplierId: ForeignKey<Supplier['id']>
    declare BankAccountId: ForeignKey<BankAccount['id']>
    declare CostCenterId: ForeignKey<CostCenter['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Payable.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        description: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        value: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        dueDate: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        paymentDate: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        status: {
            type: DataTypes.ENUM('pendente', 'pago', 'atrasado', 'cancelado'),
            defaultValue: 'pendente',
            allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'payables',
        sequelize: db,
    },
)

import payableHooks from '../hooks/payableHooks';

// Associations
Payable.belongsTo(Supplier)
Payable.belongsTo(BankAccount)
Payable.belongsTo(CostCenter)

Supplier.hasMany(Payable)
BankAccount.hasMany(Payable)
CostCenter.hasMany(Payable)

// Hooks
Payable.afterCreate(payableHooks.afterCreate);
Payable.afterUpdate(payableHooks.afterUpdate);
Payable.afterDestroy(payableHooks.afterDestroy);

export default Payable
