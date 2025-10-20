import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    DataTypes,
} from 'sequelize'
import db from '../db'

class Supplier extends Model<InferAttributes<Supplier>, InferCreationAttributes<Supplier>> {
    declare id: CreationOptional<number>
    declare name: string
    declare cnpj: CreationOptional<string>
    declare email: CreationOptional<string>
    declare phone: CreationOptional<string>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Supplier.init(
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
        cnpj: {
            type: DataTypes.STRING(20),
            unique: true,
            allowNull: true,
        },
        email: {
            type: DataTypes.STRING(128),
            allowNull: true,
        },
        phone: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'suppliers',
        sequelize: db,
    },
)

export default Supplier
