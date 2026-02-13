import { Model, InferAttributes, InferCreationAttributes, CreationOptional, DataTypes } from 'sequelize'

import db from '../db'

class Config extends Model<InferAttributes<Config>, InferCreationAttributes<Config>> {
    declare id: CreationOptional<number>
    declare type: string
    declare value: string
    declare upload: boolean

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Config.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        type: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
        },
        value: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        upload: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'configs',
        sequelize: db,
    },
)

export default Config
