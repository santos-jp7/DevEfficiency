import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'
import Opportunity, { OPPORTUNITY_STAGES, OpportunityStage } from './Opportunity'

// Cada mudança de etapa de uma oportunidade (base do tempo por etapa e da linha do tempo).
class OpportunityStageHistory extends Model<InferAttributes<OpportunityStageHistory>, InferCreationAttributes<OpportunityStageHistory>> {
    declare id: CreationOptional<number>
    declare from_stage: CreationOptional<OpportunityStage | null>
    declare to_stage: OpportunityStage
    declare OpportunityId: ForeignKey<Opportunity['id']>
    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

OpportunityStageHistory.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        from_stage: { type: DataTypes.ENUM(...OPPORTUNITY_STAGES), allowNull: true },
        to_stage: { type: DataTypes.ENUM(...OPPORTUNITY_STAGES), allowNull: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    { tableName: 'opportunity_stage_histories', sequelize: db },
)

Opportunity.hasMany(OpportunityStageHistory, { onDelete: 'CASCADE' })
OpportunityStageHistory.belongsTo(Opportunity)

export default OpportunityStageHistory
