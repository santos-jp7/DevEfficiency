import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'

import Project from './Project'

class Check extends Model<InferAttributes<Check>, InferCreationAttributes<Check>> {
    declare id: CreationOptional<number>
    declare description: string
    declare url: string
    declare condition: string
    declare send_alert: boolean

    declare status: CreationOptional<'OK' | 'Error'>

    declare ProjectId: ForeignKey<Project['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Check.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        description: {
            type: DataTypes.STRING(128),
            allowNull: false,
        },
        url: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        condition: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        send_alert: {
            type: DataTypes.STRING,
        },
        status: {
            type: DataTypes.ENUM,
            values: ['OK', 'Error'],
            defaultValue: 'OK',
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'checks',
        sequelize: db,
    },
)

export default Check
