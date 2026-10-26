import { Model, InferAttributes, InferCreationAttributes, CreationOptional, DataTypes, ForeignKey } from 'sequelize'

import db from '../db'
import Ticket from './Ticket'

class TicketMessage extends Model<InferAttributes<TicketMessage>, InferCreationAttributes<TicketMessage>> {
    declare id: CreationOptional<number>
    // cliente = veio do cliente; equipe = resposta/nota nossa; sistema = evento automático.
    declare author_type: 'cliente' | 'equipe' | 'sistema'
    declare author_name: CreationOptional<string | null>
    declare body: string
    // Nota interna não é enviada ao cliente.
    declare internal: CreationOptional<boolean>

    declare TicketId: ForeignKey<Ticket['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

TicketMessage.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        author_type: { type: DataTypes.ENUM('cliente', 'equipe', 'sistema'), allowNull: false },
        author_name: { type: DataTypes.STRING(128), allowNull: true },
        body: { type: DataTypes.TEXT, allowNull: false },
        internal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    { tableName: 'ticket_messages', sequelize: db },
)

Ticket.hasMany(TicketMessage, { onDelete: 'CASCADE' })
TicketMessage.belongsTo(Ticket)

export default TicketMessage
