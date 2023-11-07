import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'
import Protocol_product from './Protocol_product'
import Subscription from './Subscription'

class License extends Model<InferAttributes<License>, InferCreationAttributes<License>> {
    declare id: CreationOptional<number>
    declare key: string
    declare status: CreationOptional<'Ativo' | 'Inativo'>

    declare SubscriptionId: ForeignKey<Subscription['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

License.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        key: {
            type: DataTypes.STRING(36),
            allowNull: false,
            unique: true,
        },
        status: {
            type: DataTypes.ENUM,
            values: ['Ativo', 'Inativo'],
            defaultValue: 'Ativo',
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'licenses',
        sequelize: db,
    },
)

License.hasOne(Protocol_product, {
    onDelete: 'RESTRICT',
})
Protocol_product.belongsTo(License)

export default License
