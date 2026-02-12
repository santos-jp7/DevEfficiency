import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    DataTypes,
    NonAttribute,
    Association,
} from 'sequelize'

import db from '../db'

import Client from './Client'

class Address extends Model<InferAttributes<Address>, InferCreationAttributes<Address>> {
    declare id: CreationOptional<number>
    declare type: 'Entrega' | 'Cobrança'
    declare street_name: string
    declare number: CreationOptional<number>
    declare complement: CreationOptional<boolean>
    declare neighborhood: CreationOptional<string>
    declare city: string
    declare ibge: string
    declare zip: string
    declare state:
        | 'AC'
        | 'AL'
        | 'AP'
        | 'AM'
        | 'BA'
        | 'CE'
        | 'DF'
        | 'ES'
        | 'GO'
        | 'MA'
        | 'MT'
        | 'MS'
        | 'MG'
        | 'PA'
        | 'PB'
        | 'PR'
        | 'PE'
        | 'PI'
        | 'RJ'
        | 'RN'
        | 'RS'
        | 'RO'
        | 'RR'
        | 'SC'
        | 'SP'
        | 'SE'
        | 'TO'

    declare ClientId: ForeignKey<Client['id']>

    declare Client: NonAttribute<Client>

    declare static associations: {
        Client: Association<Address, Client>
    }

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Address.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        type: {
            type: DataTypes.ENUM('Entrega', 'Cobrança'),
            allowNull: false,
        },
        street_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        number: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        complement: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        neighborhood: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        city: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        state: {
            type: DataTypes.ENUM(
                'AC',
                'AL',
                'AP',
                'AM',
                'BA',
                'CE',
                'DF',
                'ES',
                'GO',
                'MA',
                'MT',
                'MS',
                'MG',
                'PA',
                'PB',
                'PR',
                'PE',
                'PI',
                'RJ',
                'RN',
                'RS',
                'RO',
                'RR',
                'SC',
                'SP',
                'SE',
                'TO',
            ),
            allowNull: false,
        },
        ibge: {
            type: DataTypes.STRING(7),
            allowNull: false,
        },
        zip: {
            type: DataTypes.STRING(8),
            allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'addresses',
        sequelize: db,
    },
)

export default Address
