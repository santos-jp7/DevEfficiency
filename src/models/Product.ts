import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'

class Product extends Model<InferAttributes<Product>, InferCreationAttributes<Product>> {
    declare id: CreationOptional<number>
    declare description: string
    declare value: number
    declare coust: number
    declare generate_license: boolean

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Product.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        description: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        value: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0,
        },
        coust: {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0,
        },
        generate_license: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'products',
        sequelize: db,
    },
)

export default Product
