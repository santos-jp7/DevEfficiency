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
import Contact from './Contact'

import Credential from './Credential'
import Project from './Project'
import Server from './Server'
import Service_order from './Service_order'
import Protocol from './Protocol'
import License from './License'
import Subscription from './Subscription'
import Billing from './Billing'

class Client extends Model<InferAttributes<Client>, InferCreationAttributes<Client>> {
    declare id: CreationOptional<number>
    declare name: string

    declare corporate_name: CreationOptional<string>
    declare document: CreationOptional<string>
    declare email: CreationOptional<string>
    declare due_day: CreationOptional<number>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    declare getCredentials: HasManyGetAssociationsMixin<Credential>
    declare createCredential: HasManyCreateAssociationMixin<Credential, 'ClientId'>

    declare getServers: HasManyGetAssociationsMixin<Server>
    declare createServer: HasManyCreateAssociationMixin<Server, 'ClientId'>

    declare getProjects: HasManyGetAssociationsMixin<Project>
    declare createProject: HasManyCreateAssociationMixin<Project, 'ClientId'>

    declare getService_orders: HasManyGetAssociationsMixin<Service_order>
    declare createService_order: HasManyCreateAssociationMixin<Service_order, 'ClientId'>

    declare getContacts: HasManyGetAssociationsMixin<Contact>
    declare createContact: HasManyCreateAssociationMixin<Contact, 'ClientId'>

    declare getSubscription: HasManyGetAssociationsMixin<Subscription>

    declare getBillings: HasManyGetAssociationsMixin<Billing>
    declare createBilling: HasManyCreateAssociationMixin<Billing, 'ClientId'>

    declare credentials: NonAttribute<Credential[]>
    declare servers: NonAttribute<Server[]>
    declare projects: NonAttribute<Project[]>
    declare service_orders: NonAttribute<Service_order[]>
    declare contacts: NonAttribute<Contact[]>
    declare protocols: NonAttribute<Protocol[]>
    declare licenses: NonAttribute<License[]>
    declare subscriptions: NonAttribute<Subscription[]>

    declare static associations: {
        credentials: Association<Client, Credential>
        servers: Association<Client, Server>
        projects: Association<Client, Project>
        service_orders: Association<Client, Service_order>
        contacts: Association<Client, Contact>
        protocols: Association<Client, Protocol>
        licenses: Association<Client, License>
        subscriptions: Association<Client, Subscription>
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
        due_day: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 20,
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

Client.hasMany(Server, {
    onDelete: 'RESTRICT',
})

Client.hasMany(Project, {
    onDelete: 'RESTRICT',
})

Client.hasMany(Service_order, {
    onDelete: 'RESTRICT',
})

Client.hasMany(Contact, {
    onDelete: 'RESTRICT',
})

Client.hasMany(Subscription, {
    onDelete: 'RESTRICT',
})

Client.hasMany(Billing, {
    onDelete: 'RESTRICT',
})

Project.belongsTo(Client)
Server.belongsTo(Client)
Service_order.belongsTo(Client)
Contact.belongsTo(Client)
Subscription.belongsTo(Client)
Billing.belongsTo(Client)

export default Client
