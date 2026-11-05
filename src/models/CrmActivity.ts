import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'
import Client from './Client'
import Lead from './Lead'
import Opportunity from './Opportunity'
import User from './User'

export const ACTIVITY_TYPES = ['Ligação', 'Reunião', 'E-mail', 'WhatsApp', 'Tarefa', 'Nota'] as const

// Atividade comercial. Follow-up = atividade com due_at e ainda sem done_at.
class CrmActivity extends Model<InferAttributes<CrmActivity>, InferCreationAttributes<CrmActivity>> {
    declare id: CreationOptional<number>
    declare type: CreationOptional<(typeof ACTIVITY_TYPES)[number]>
    declare subject: string
    declare description: CreationOptional<string | null>
    declare due_at: CreationOptional<Date | null>
    declare done_at: CreationOptional<Date | null>

    declare LeadId: CreationOptional<ForeignKey<Lead['id']> | null>
    declare OpportunityId: CreationOptional<ForeignKey<Opportunity['id']> | null>
    declare ClientId: CreationOptional<ForeignKey<Client['id']> | null>
    // Responsável pela atividade e quem registrou.
    declare UserId: CreationOptional<ForeignKey<User['id']> | null>
    declare CreatedById: CreationOptional<ForeignKey<User['id']> | null>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

CrmActivity.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        type: { type: DataTypes.ENUM(...ACTIVITY_TYPES), allowNull: false, defaultValue: 'Tarefa' },
        subject: { type: DataTypes.STRING(160), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: true },
        due_at: { type: DataTypes.DATE, allowNull: true },
        done_at: { type: DataTypes.DATE, allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    { tableName: 'crm_activities', sequelize: db },
)

CrmActivity.belongsTo(Lead)
Lead.hasMany(CrmActivity)
CrmActivity.belongsTo(Opportunity)
Opportunity.hasMany(CrmActivity, { onDelete: 'CASCADE' })
CrmActivity.belongsTo(Client)
CrmActivity.belongsTo(User, { as: 'Owner', foreignKey: 'UserId' })
CrmActivity.belongsTo(User, { as: 'CreatedBy', foreignKey: 'CreatedById' })
Client.hasMany(CrmActivity)

export default CrmActivity
