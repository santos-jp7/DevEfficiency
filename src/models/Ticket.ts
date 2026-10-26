import { Model, InferAttributes, InferCreationAttributes, CreationOptional, DataTypes, ForeignKey } from 'sequelize'

import db from '../db'
import Client from './Client'
import Project from './Project'
import Contact from './Contact'
import Service_order from './Service_order'

export const TICKET_STATUSES = [
    'Aberto',
    'Em análise',
    'Aguardando cliente',
    'Respondido',
    'Convertido em OS',
    'Resolvido',
    'Cancelado',
] as const

export const TICKET_TYPES = ['Dúvida', 'Validação', 'Problema', 'Solicitação', 'Outro'] as const

export type TicketStatus = (typeof TICKET_STATUSES)[number]

class Ticket extends Model<InferAttributes<Ticket>, InferCreationAttributes<Ticket>> {
    declare id: CreationOptional<number>
    declare subject: string
    declare description: CreationOptional<string | null>
    declare type: CreationOptional<(typeof TICKET_TYPES)[number]>
    declare status: CreationOptional<TicketStatus>
    // Mesma escala da OS, para a conversão levar a gravidade direto.
    declare gravidade: CreationOptional<'Crítico' | 'Alto' | 'Médio' | 'Baixo' | null>
    // Por onde o chamado chegou. Hoje só "Manual"; "Painel" e "Email" entram nas próximas etapas.
    declare channel: CreationOptional<'Manual' | 'Painel' | 'Email'>

    declare requester_name: CreationOptional<string | null>
    declare requester_email: CreationOptional<string | null>

    declare first_response_at: CreationOptional<Date | null>
    declare resolvedAt: CreationOptional<Date | null>

    declare ClientId: CreationOptional<ForeignKey<Client['id']> | null>
    declare ProjectId: CreationOptional<ForeignKey<Project['id']> | null>
    declare ContactId: CreationOptional<ForeignKey<Contact['id']> | null>
    declare ServiceOrderId: CreationOptional<ForeignKey<Service_order['id']> | null>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Ticket.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        subject: { type: DataTypes.STRING(160), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: true },
        type: { type: DataTypes.ENUM(...TICKET_TYPES), allowNull: false, defaultValue: 'Dúvida' },
        status: { type: DataTypes.ENUM(...TICKET_STATUSES), allowNull: false, defaultValue: 'Aberto' },
        gravidade: { type: DataTypes.ENUM('Crítico', 'Alto', 'Médio', 'Baixo'), allowNull: true },
        channel: { type: DataTypes.ENUM('Manual', 'Painel', 'Email'), allowNull: false, defaultValue: 'Manual' },
        requester_name: { type: DataTypes.STRING(128), allowNull: true },
        requester_email: { type: DataTypes.STRING(128), allowNull: true },
        first_response_at: { type: DataTypes.DATE, allowNull: true },
        resolvedAt: { type: DataTypes.DATE, allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    { tableName: 'tickets', sequelize: db },
)

Ticket.belongsTo(Client)
Ticket.belongsTo(Project)
Ticket.belongsTo(Contact)
Ticket.belongsTo(Service_order)
Service_order.hasOne(Ticket)

export default Ticket
