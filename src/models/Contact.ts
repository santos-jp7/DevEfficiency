import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'

import Client from './Client'

class Contact extends Model<InferAttributes<Contact>, InferCreationAttributes<Contact>> {
    declare id: CreationOptional<number>
    declare name: string
    declare email: CreationOptional<string>
    declare number: CreationOptional<string>
    declare whatsapp: CreationOptional<string>

    declare ClientId: ForeignKey<Client['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Contact.init(
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
        email: {
            type: DataTypes.STRING,
        },
        number: {
            type: DataTypes.STRING,
        },
        whatsapp: {
            type: DataTypes.STRING,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'contacts',
        sequelize: db,
    },
)

export default Contact
