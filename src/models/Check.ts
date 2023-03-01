import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    DataTypes,
    NonAttribute,
    Association,
} from 'sequelize'

import db from '../db'

import Project from './Project'

class Check extends Model<InferAttributes<Check>, InferCreationAttributes<Check>> {
    declare id: CreationOptional<number>
    declare description: string
    declare url: string
    declare condition: string
    declare send_alert: boolean
    declare message: string
    declare path_return: CreationOptional<string>
    declare return: CreationOptional<string>
    declare verify_status: CreationOptional<boolean>

    declare status: CreationOptional<'OK' | 'Error'>

    declare ProjectId: ForeignKey<Project['id']>

    declare Project: NonAttribute<Project>

    declare static associations: {
        Project: Association<Check, Project>
    }

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
        },
        send_alert: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        verify_status: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        path_return: {
            type: DataTypes.STRING,
        },
        return: {
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
