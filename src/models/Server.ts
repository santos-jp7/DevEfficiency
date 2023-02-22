import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'

import Client from './Client'
import Project from './Project'

class Server extends Model<InferAttributes<Server>, InferCreationAttributes<Server>> {
    declare id: CreationOptional<number>
    declare description: CreationOptional<string>
    declare provider: CreationOptional<string>
    declare host: CreationOptional<string>
    declare username: CreationOptional<string>
    declare password: CreationOptional<string>
    declare rsa: CreationOptional<string>

    declare ClientId: ForeignKey<Client['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Server.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        description: {
            type: DataTypes.STRING(255),
        },
        provider: {
            type: DataTypes.STRING(128),
        },
        host: {
            type: DataTypes.STRING(128),
        },
        username: {
            type: DataTypes.STRING(128),
        },
        password: {
            type: DataTypes.STRING(128),
        },
        rsa: {
            type: DataTypes.TEXT,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'servers',
        sequelize: db,
    },
)

Server.hasMany(Project, {
    onDelete: 'RESTRICT',
})

Project.belongsTo(Server)

export default Server
