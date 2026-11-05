import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'
import Client from './Client'
import Seller from './Seller'
import User from './User'

export const LEAD_SOURCES = ['Indicação', 'Site', 'WhatsApp', 'Instagram', 'Google', 'Evento', 'Parceiro', 'Outro'] as const
export const LEAD_STATUSES = ['Ativo', 'Convertido', 'Descartado'] as const

// CRM: pessoa/empresa que ainda não é cliente (ou um contato comercial de um cliente existente).
class Lead extends Model<InferAttributes<Lead>, InferCreationAttributes<Lead>> {
    declare id: CreationOptional<number>
    declare name: string
    declare company: CreationOptional<string | null>
    declare document: CreationOptional<string | null>
    declare email: CreationOptional<string | null>
    declare phone: CreationOptional<string | null>
    declare whatsapp: CreationOptional<string | null>
    declare source: CreationOptional<(typeof LEAD_SOURCES)[number]>
    declare status: CreationOptional<(typeof LEAD_STATUSES)[number]>
    declare notes: CreationOptional<string | null>

    // Preenchido na conversão (ou quando o lead já é de um cliente existente).
    declare ClientId: CreationOptional<ForeignKey<Client['id']> | null>
    declare SellerId: CreationOptional<ForeignKey<Seller['id']> | null>
    // Responsável (usuário do sistema). Hoje há um usuário; com mais, filtra "minhas" e organiza os follow-ups.
    declare UserId: CreationOptional<ForeignKey<User['id']> | null>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Lead.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        name: { type: DataTypes.STRING(128), allowNull: false },
        company: { type: DataTypes.STRING(160), allowNull: true },
        document: { type: DataTypes.STRING(20), allowNull: true },
        email: { type: DataTypes.STRING(128), allowNull: true },
        phone: { type: DataTypes.STRING(20), allowNull: true },
        whatsapp: { type: DataTypes.STRING(20), allowNull: true },
        source: { type: DataTypes.ENUM(...LEAD_SOURCES), allowNull: false, defaultValue: 'Outro' },
        status: { type: DataTypes.ENUM(...LEAD_STATUSES), allowNull: false, defaultValue: 'Ativo' },
        notes: { type: DataTypes.TEXT, allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    { tableName: 'leads', sequelize: db },
)

Lead.belongsTo(Client)
Client.hasMany(Lead)
Lead.belongsTo(Seller)
Lead.belongsTo(User, { as: 'Owner', foreignKey: 'UserId' })

export default Lead
