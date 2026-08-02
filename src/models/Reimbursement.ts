import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    DataTypes,
    ForeignKey,
} from 'sequelize'
import db from '../db'
import Payable from './Payable'
import BankAccount from './BankAccount'
import Supplier from './Supplier'
import User from './User'

class Reimbursement extends Model<InferAttributes<Reimbursement>, InferCreationAttributes<Reimbursement>> {
    declare id: CreationOptional<number>
    declare description: string
    declare value: number

    declare PayableId: ForeignKey<Payable['id']>
    declare BankAccountId: ForeignKey<BankAccount['id']>
    declare SupplierId: ForeignKey<Supplier['id']>
    declare UserId: ForeignKey<User['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Reimbursement.init(
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
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'reimbursements',
        sequelize: db,
    },
)

Reimbursement.belongsTo(Payable)
Reimbursement.belongsTo(BankAccount)
Reimbursement.belongsTo(Supplier)
Reimbursement.belongsTo(User)

Payable.hasOne(Reimbursement, { onDelete: 'SET NULL' })
BankAccount.hasMany(Reimbursement)
Supplier.hasMany(Reimbursement)
User.hasMany(Reimbursement)

export default Reimbursement
