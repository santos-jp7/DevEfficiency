import { Model, InferAttributes, InferCreationAttributes, CreationOptional, ForeignKey, DataTypes } from 'sequelize'

import db from '../db'
import Client from './Client'
import Lead from './Lead'
import Seller from './Seller'
import Supplier from './Supplier'
import Service_order from './Service_order'
import Protocol from './Protocol'

export const OPPORTUNITY_STAGES = ['Novo', 'Qualificado', 'Proposta', 'Negociação', 'Ganho', 'Perdido'] as const
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number]
export const OPEN_STAGES: OpportunityStage[] = ['Novo', 'Qualificado', 'Proposta', 'Negociação']

// Probabilidade padrão por etapa (pode ser ajustada na oportunidade).
export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
    Novo: 10,
    Qualificado: 25,
    Proposta: 50,
    Negociação: 75,
    Ganho: 100,
    Perdido: 0,
}

export const OPPORTUNITY_KINDS = ['Serviço', 'Produto/Licença', 'Assinatura'] as const
export const LOST_REASONS = ['Preço', 'Concorrente', 'Sem orçamento', 'Sem resposta', 'Timing', 'Escopo', 'Outro'] as const

const money = (field: string, precision = 12) => ({
    type: DataTypes.DECIMAL(precision, 2),
    allowNull: true,
    get(this: any) {
        const v = this.getDataValue(field)
        return v === null || v === undefined ? null : Number(v)
    },
})

class Opportunity extends Model<InferAttributes<Opportunity>, InferCreationAttributes<Opportunity>> {
    declare id: CreationOptional<number>
    declare title: string
    declare stage: CreationOptional<OpportunityStage>
    declare estimated_value: CreationOptional<number | null>
    declare probability: CreationOptional<number>
    declare expected_close_date: CreationOptional<string | null>
    declare kind: CreationOptional<(typeof OPPORTUNITY_KINDS)[number]>
    declare notes: CreationOptional<string | null>
    declare position: CreationOptional<number>

    declare lost_reason: CreationOptional<(typeof LOST_REASONS)[number] | null>
    declare lost_details: CreationOptional<string | null>

    declare stage_changed_at: CreationOptional<Date | null>
    declare won_at: CreationOptional<Date | null>
    declare lost_at: CreationOptional<Date | null>

    // Negócio de um lead (ainda não cliente) OU de um cliente existente (upsell).
    declare LeadId: CreationOptional<ForeignKey<Lead['id']> | null>
    declare ClientId: CreationOptional<ForeignKey<Client['id']> | null>
    declare SellerId: CreationOptional<ForeignKey<Seller['id']> | null>

    // Cobrança prevista (mesmos campos do protocolo): direta ou comissão de terceiro.
    declare billing_mode: CreationOptional<'Direto' | 'Comissão'>
    declare CommissionSupplierId: CreationOptional<ForeignKey<Supplier['id']> | null>
    declare commission_percent: CreationOptional<number | null>
    declare commission_value: CreationOptional<number | null>
    declare commission_manual: CreationOptional<boolean>

    // Resultado da conversão (ganho).
    declare ServiceOrderId: CreationOptional<ForeignKey<Service_order['id']> | null>
    declare ProtocolId: CreationOptional<ForeignKey<Protocol['id']> | null>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Opportunity.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        title: { type: DataTypes.STRING(160), allowNull: false },
        stage: { type: DataTypes.ENUM(...OPPORTUNITY_STAGES), allowNull: false, defaultValue: 'Novo' },
        estimated_value: money('estimated_value'),
        probability: { type: DataTypes.INTEGER, allowNull: false, defaultValue: STAGE_PROBABILITY.Novo },
        expected_close_date: { type: DataTypes.DATEONLY, allowNull: true },
        kind: { type: DataTypes.ENUM(...OPPORTUNITY_KINDS), allowNull: false, defaultValue: 'Serviço' },
        notes: { type: DataTypes.TEXT, allowNull: true },
        position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        lost_reason: { type: DataTypes.ENUM(...LOST_REASONS), allowNull: true },
        lost_details: { type: DataTypes.STRING(255), allowNull: true },
        stage_changed_at: { type: DataTypes.DATE, allowNull: true },
        won_at: { type: DataTypes.DATE, allowNull: true },
        lost_at: { type: DataTypes.DATE, allowNull: true },
        billing_mode: { type: DataTypes.ENUM('Direto', 'Comissão'), allowNull: false, defaultValue: 'Direto' },
        commission_percent: money('commission_percent', 5),
        commission_value: money('commission_value', 10),
        commission_manual: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    { tableName: 'opportunities', sequelize: db },
)

Opportunity.belongsTo(Lead)
Lead.hasMany(Opportunity)
Opportunity.belongsTo(Client)
Client.hasMany(Opportunity)
Opportunity.belongsTo(Seller)
Opportunity.belongsTo(Supplier, { as: 'CommissionSupplier', foreignKey: 'CommissionSupplierId' })
Opportunity.belongsTo(Service_order)
Opportunity.belongsTo(Protocol)

export default Opportunity
