import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'

import ServiceOrder from './ServiceOrder'

class Payment extends Model<InferAttributes<Payment>, InferCreationAttributes<Payment>> {
    declare id: CreationOptional<number>
    declare type: 'Entrada' | 'Saída'
    declare method: 'Pix' | 'Boleto' | 'Cartão' | 'Transferência' | 'Espécie'
    declare value: number

    declare status: CreationOptional<'Em aberto' | 'Pago' | 'Cancelado' | 'Estornado'>

    declare serviceOrderId: ForeignKey<ServiceOrder['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Payment.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        type: {
            type: DataTypes.ENUM,
            values: ['Entrada', 'Saída'],
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM,
            values: ['Em aberto', 'Pago', 'Cancelado', 'Estornado'],
            defaultValue: 'Em aberto',
        },
        method: {
            type: DataTypes.ENUM,
            values: ['Pix', 'Boleto', 'Cartão', 'Transferência', 'Espécie'],
            allowNull: false,
        },
        value: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'payments',
        sequelize: db,
    },
)

Payment.hasOne(ServiceOrder, {
    sourceKey: 'id',
    foreignKey: 'serviceOrderId',
    as: 'serviceOrder',
    onDelete: 'RESTRICT',
})

export default Payment
