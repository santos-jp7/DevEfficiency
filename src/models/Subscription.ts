import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    DataTypes,
    HasManyGetAssociationsMixin,
    HasManyCreateAssociationMixin,
} from 'sequelize'

import db from '../db'
import License from './License'
import Client from './Client'
import Project from './Project'
import Protocol from './Protocol'

class Subscription extends Model<InferAttributes<Subscription>, InferCreationAttributes<Subscription>> {
    declare id: CreationOptional<number>
    declare name: CreationOptional<number>
    declare status: CreationOptional<'Pendente' | 'Pago' | 'Não Pago' | 'Cancelado'>
    declare dueAt: Date

    declare getProtocols: HasManyGetAssociationsMixin<Protocol>
    declare createProtocol: HasManyCreateAssociationMixin<Protocol, 'SubscriptionId'>

    declare ClientId: ForeignKey<Client['id']>
    declare ProjectId: ForeignKey<Project['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Subscription.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(55),
        },
        status: {
            type: DataTypes.ENUM,
            values: ['Pendente', 'Pago', 'Não pago', 'Cancelado'],
            defaultValue: 'Pago',
        },
        dueAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'subscriptions',
        sequelize: db,
    },
)

Subscription.hasMany(License, {
    onDelete: 'RESTRICT',
})

License.belongsTo(Subscription)

export default Subscription
