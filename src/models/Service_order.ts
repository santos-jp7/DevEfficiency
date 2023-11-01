import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    DataTypes,
    HasOneGetAssociationMixin,
    HasOneCreateAssociationMixin,
    NonAttribute,
    Association,
} from 'sequelize'

import db from '../db'

import Project from './Project'
import Protocol from './Protocol'
import Client from './Client'

class Service_order extends Model<InferAttributes<Service_order>, InferCreationAttributes<Service_order>> {
    declare id: CreationOptional<number>
    declare subject: string
    declare description: CreationOptional<string>
    declare status: CreationOptional<
        'Em avaliação' | 'Orçamento enviado' | 'Na fila' | 'Em correções' | 'Pendente' | 'Finalizado' | 'Cancelado'
    >

    declare ProjectId: ForeignKey<Project['id']>
    declare ClientId: ForeignKey<Client['id']>

    declare getProtocol: HasOneGetAssociationMixin<Protocol>
    declare createProtocol: HasOneCreateAssociationMixin<Protocol>

    declare Protocol: NonAttribute<Protocol>
    declare Project: NonAttribute<Project>
    declare Client: NonAttribute<Client>

    declare static associations: {
        Protocol: Association<Service_order, Protocol>
        Project: Association<Service_order, Project>
        Client: Association<Project, Client>
    }

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Service_order.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        subject: {
            type: DataTypes.STRING(128),
            allowNull: false,
        },
        description: {
            type: DataTypes.STRING,
        },
        status: {
            type: DataTypes.ENUM,
            values: [
                'Em avaliação',
                'Orçamento enviado',
                'Na fila',
                'Em correções',
                'Pendente',
                'Finalizado',
                'Cancelado',
            ],
            defaultValue: 'Em avaliação',
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'service_orders',
        sequelize: db,
    },
)

Service_order.hasOne(Protocol, {
    onDelete: 'RESTRICT',
})

Protocol.belongsTo(Service_order)

export default Service_order
