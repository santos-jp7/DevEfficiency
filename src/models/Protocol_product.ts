import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    DataTypes,
    HasOneGetAssociationMixin,
    HasOneCreateAssociationMixin,
    Association,
} from 'sequelize'

import db from '../db'

import Product from './Product'
import Protocol from './Protocol'
import License from './License'

class Protocol_product extends Model<InferAttributes<Protocol_product>, InferCreationAttributes<Protocol_product>> {
    declare id: CreationOptional<number>

    declare charge_type: 'Único' | 'Mensal' | 'Anual'
    declare value: number

    declare ProductId: ForeignKey<Product['id']>
    declare ProtocolId: ForeignKey<Protocol['id']>
    declare LicenseId: ForeignKey<License['id']>

    declare getLicense: HasOneGetAssociationMixin<License>
    declare createLicense: HasOneCreateAssociationMixin<License>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    declare static associations: {
        license: Association<Protocol_product, License>
    }
}

Protocol_product.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        charge_type: {
            type: DataTypes.ENUM,
            values: ['Único', 'Mensal', 'Anual'],
        },
        value: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'protocol_products',
        sequelize: db,
    },
)

Protocol_product.belongsTo(Product)

export default Protocol_product
