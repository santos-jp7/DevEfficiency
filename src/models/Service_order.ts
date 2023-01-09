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

class Service_order extends Model<InferAttributes<Service_order>, InferCreationAttributes<Service_order>> {
    declare id: CreationOptional<number>
    declare subject: string
    declare description: CreationOptional<string>
    declare status: CreationOptional<'Em avaliação' | 'Em andamento' | 'Pendente' | 'Finalizado' | 'Cancelado'>

    declare projectId: ForeignKey<Project['id']>

    declare getProtocol: HasOneGetAssociationMixin<Protocol>
    declare createProtocol: HasOneCreateAssociationMixin<Protocol>

    declare protocol: NonAttribute<Protocol>

    declare static associations: {
        protocol: Association<Service_order, Protocol>
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
            values: ['Em avaliação', 'Em correções', 'Pendente', 'Finalizado', 'Cancelado'],
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

export default Service_order
