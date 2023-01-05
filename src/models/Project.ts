import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    DataTypes,
    NonAttribute,
    HasManyGetAssociationsMixin,
    HasManyCreateAssociationMixin,
    Association,
} from 'sequelize'

import db from '../db'

import Client from './Client'
import Service_order from './Service_order'
import Subproject from './Subproject'

class Project extends Model<InferAttributes<Project>, InferCreationAttributes<Project>> {
    declare id: CreationOptional<number>
    declare name: string
    declare url: CreationOptional<string>
    declare type: CreationOptional<'API' | 'Bot' | 'WebSite' | 'Automação' | 'Crawler' | 'Outros'>

    declare clientId: ForeignKey<Client['id']>

    declare getSubproject: HasManyGetAssociationsMixin<Subproject>
    declare createSubproject: HasManyCreateAssociationMixin<Subproject, 'projectId'>

    declare getService_order: HasManyGetAssociationsMixin<Service_order>
    declare createService_order: HasManyCreateAssociationMixin<Service_order, 'projectId'>

    declare subprojects: NonAttribute<Subproject[]>
    declare service_orders: NonAttribute<Service_order[]>

    declare static associations: {
        subprojects: Association<Project, Subproject>
        service_orders: Association<Project, Service_order>
    }

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Project.init(
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
        url: {
            type: DataTypes.STRING,
        },
        type: {
            type: DataTypes.ENUM,
            values: ['API', 'Bot', 'WebSite', 'Automação', 'Crawler', 'Outros'],
            defaultValue: 'Outros',
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'projects',
        sequelize: db,
    },
)

Project.hasMany(Subproject, {
    onDelete: 'RESTRICT',
})

Project.hasMany(Service_order, {
    onDelete: 'RESTRICT',
})

export default Project
