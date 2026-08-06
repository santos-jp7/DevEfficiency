import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    DataTypes,
} from 'sequelize'
import db from '../db'
import Client from './Client'

class ClientSlaConfig extends Model<InferAttributes<ClientSlaConfig>, InferCreationAttributes<ClientSlaConfig>> {
    declare id: CreationOptional<number>
    declare ClientId: ForeignKey<Client['id']>
    declare gravidade: 'Crítico' | 'Alto' | 'Médio' | 'Baixo'
    declare response_hours: number
    declare solution_hours: number
    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

ClientSlaConfig.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        ClientId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        gravidade: {
            type: DataTypes.ENUM('Crítico', 'Alto', 'Médio', 'Baixo'),
            allowNull: false,
        },
        response_hours: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        solution_hours: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'client_sla_configs',
        sequelize: db,
    },
)

Client.hasMany(ClientSlaConfig, { foreignKey: 'ClientId', as: 'SlaConfigs', onDelete: 'CASCADE' })
ClientSlaConfig.belongsTo(Client, { foreignKey: 'ClientId' })

export default ClientSlaConfig
