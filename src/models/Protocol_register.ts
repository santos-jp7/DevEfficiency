import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'

import Protocol from './Protocol'

import protocolRegisterHooks from '../hooks/protocolRegisterHooks'

class Protocol_register extends Model<InferAttributes<Protocol_register>, InferCreationAttributes<Protocol_register>> {
    declare id: CreationOptional<number>

    declare description: string
    declare value: number

    declare type: 'Serviço' | 'Despesa'

    // Precificação por hora (somente type = 'Serviço'). Registros antigos ficam null.
    declare estimated_hours: CreationOptional<number | null>
    declare hourly_rate: CreationOptional<number | null>
    declare gross_value: CreationOptional<number | null>
    declare partner_discount_percent: CreationOptional<number | null>
    declare partner_discount_value: CreationOptional<number | null>
    declare manual_override: CreationOptional<boolean>

    declare ProtocolId: ForeignKey<Protocol['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Protocol_register.init(
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
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM,
            values: ['Serviço', 'Despesa'],
            allowNull: false,
        },
        estimated_hours: {
            type: DataTypes.DECIMAL(6, 2),
            allowNull: true,
            get() {
                const v = this.getDataValue('estimated_hours')
                return v === null || v === undefined ? null : Number(v)
            },
        },
        hourly_rate: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            get() {
                const v = this.getDataValue('hourly_rate')
                return v === null || v === undefined ? null : Number(v)
            },
        },
        gross_value: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            get() {
                const v = this.getDataValue('gross_value')
                return v === null || v === undefined ? null : Number(v)
            },
        },
        partner_discount_percent: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: true,
            get() {
                const v = this.getDataValue('partner_discount_percent')
                return v === null || v === undefined ? null : Number(v)
            },
        },
        partner_discount_value: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
            get() {
                const v = this.getDataValue('partner_discount_value')
                return v === null || v === undefined ? null : Number(v)
            },
        },
        manual_override: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'protocol_registers',
        sequelize: db,
    },
)

Protocol_register.afterCreate(protocolRegisterHooks.afterCreate)

export default Protocol_register
