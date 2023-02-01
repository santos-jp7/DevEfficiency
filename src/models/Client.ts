import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    HasManyGetAssociationsMixin,
    NonAttribute,
    DataTypes,
    HasManyCreateAssociationMixin,
    Association,
} from 'sequelize'

import db from '../db'

import Credential from './Credential'
import Project from './Project'

class Client extends Model<InferAttributes<Client>, InferCreationAttributes<Client>> {
    declare id: CreationOptional<number>
    declare name: string

    declare corporate_name: CreationOptional<string>
    declare document: CreationOptional<string>
    declare email: CreationOptional<string>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    declare getCredential: HasManyGetAssociationsMixin<Credential>
    declare createCredential: HasManyCreateAssociationMixin<Credential, 'ClientId'>

    declare getProject: HasManyGetAssociationsMixin<Project>
    declare createProject: HasManyCreateAssociationMixin<Project, 'ClientId'>

    declare credentials: NonAttribute<Credential[]>
    declare projects: NonAttribute<Project[]>

    declare static associations: {
        credentials: Association<Client, Credential>
        projects: Association<Client, Project>
    }
}

Client.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(128),
            allowNull: false,
        },
        corporate_name: {
            type: DataTypes.STRING(255),
        },
        document: {
            type: DataTypes.STRING(15),
        },
        email: {
            type: DataTypes.STRING(128),
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'clients',
        sequelize: db,
    },
)

Client.hasMany(Credential, {
    onDelete: 'RESTRICT',
})

Client.hasMany(Project, {
    onDelete: 'RESTRICT',
})

Project.belongsTo(Client)

export default Client
