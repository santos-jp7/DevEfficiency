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
import Check from './Check'

import Client from './Client'
import Server from './Server'
import Service_order from './Service_order'
import Subproject from './Subproject'
import Subscription from './Subscription'

class Project extends Model<InferAttributes<Project>, InferCreationAttributes<Project>> {
    declare id: CreationOptional<number>
    declare name: string
    declare url: CreationOptional<string>
    declare fixed: CreationOptional<boolean>
    declare type: CreationOptional<'API' | 'Bot' | 'WebSite' | 'Automação' | 'Crawler' | 'Outros'>

    declare ClientId: ForeignKey<Client['id']>
    declare ServerId: ForeignKey<Server['id']>

    declare getSubproject: HasManyGetAssociationsMixin<Subproject>
    declare createSubproject: HasManyCreateAssociationMixin<Subproject, 'ProjectId'>

    declare getService_order: HasManyGetAssociationsMixin<Service_order>
    declare createService_order: HasManyCreateAssociationMixin<Service_order, 'ProjectId'>

    declare getChecks: HasManyGetAssociationsMixin<Check>
    declare createCheck: HasManyCreateAssociationMixin<Check, 'ProjectId'>

    declare getSubscription: HasManyGetAssociationsMixin<Subscription>

    declare Subprojects: NonAttribute<Subproject[]>
    declare Service_orders: NonAttribute<Service_order[]>
    declare Checks: NonAttribute<Check[]>
    declare Subscription: NonAttribute<Subscription[]>

    declare Client: NonAttribute<Client>

    declare static associations: {
        Subprojects: Association<Project, Subproject>
        Service_orders: Association<Project, Service_order>
        Checks: Association<Project, Check>
        Client: Association<Project, Client>
        Subscription: Association<Project, Subscription>
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
        fixed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        type: {
            type: DataTypes.ENUM,
            values: ['API', 'Bot', 'WebSite', 'Automação', 'Crawler', 'Outros'],
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

Project.hasMany(Check, {
    onDelete: 'RESTRICT',
})

Project.hasMany(Subscription, {
    onDelete: 'RESTRICT',
})

Service_order.belongsTo(Project)
Check.belongsTo(Project)
Subscription.belongsTo(Project)

export default Project
