import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    DataTypes,
    ForeignKey,
    NonAttribute,
} from 'sequelize'

import db from '../db'
import Billing from './Billing'
import BillingFile from './BillingFile'

// NFS-e emitida pelo Emissor Nacional (Sefin Nacional) para uma cobrança.
// processando: enviada sem resposta conclusiva (timeout/queda) — "Verificar" consulta a Sefin pelo Id da DPS.
// autorizada: NFS-e gerada (chave de acesso + XML). rejeitada: a Sefin devolveu erros (o número da DPS não é reaproveitado).
export type NfseStatus = 'processando' | 'autorizada' | 'rejeitada' | 'cancelada'

class Nfse extends Model<InferAttributes<Nfse>, InferCreationAttributes<Nfse>> {
    declare id: CreationOptional<number>
    declare status: CreationOptional<NfseStatus>
    declare ambiente: 'producao' | 'producao_restrita'

    declare serie: string
    declare numero_dps: number
    declare id_dps: string
    declare competencia: string

    declare chave_acesso: CreationOptional<string | null>
    declare numero_nfse: CreationOptional<string | null>
    declare data_processamento: CreationOptional<Date | null>

    declare valor_servico: number
    declare descricao: string
    declare tomador_documento: string
    declare tomador_nome: string

    declare xml_dps: string
    declare xml_nfse: CreationOptional<string | null>
    declare erros: CreationOptional<{ codigo: string; descricao: string; complemento?: string }[] | null>
    declare alertas: CreationOptional<{ codigo: string; descricao: string; complemento?: string }[] | null>

    declare BillingId: ForeignKey<Billing['id']> | null
    declare BillingFileId: CreationOptional<ForeignKey<BillingFile['id']> | null>
    declare UserId: CreationOptional<number | null>

    declare Billing?: NonAttribute<Billing>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

// JSON guardado como texto (funciona igual em MySQL e MariaDB).
function jsonColumn(name: 'erros' | 'alertas') {
    return {
        type: DataTypes.TEXT,
        allowNull: true,
        get(this: any) {
            const raw = this.getDataValue(name)
            if (raw === null || raw === undefined || raw === '') return null
            try {
                return typeof raw === 'string' ? JSON.parse(raw) : raw
            } catch {
                return null
            }
        },
        set(this: any, value: unknown) {
            this.setDataValue(name, value === null || value === undefined ? null : (JSON.stringify(value) as any))
        },
    }
}

Nfse.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        status: {
            type: DataTypes.ENUM('processando', 'autorizada', 'rejeitada', 'cancelada'),
            allowNull: false,
            defaultValue: 'processando',
        },
        ambiente: { type: DataTypes.ENUM('producao', 'producao_restrita'), allowNull: false },
        serie: { type: DataTypes.STRING(5), allowNull: false },
        numero_dps: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
        id_dps: { type: DataTypes.STRING(45), allowNull: false },
        competencia: { type: DataTypes.DATEONLY, allowNull: false },
        chave_acesso: { type: DataTypes.STRING(50), allowNull: true },
        numero_nfse: { type: DataTypes.STRING(20), allowNull: true },
        data_processamento: { type: DataTypes.DATE, allowNull: true },
        valor_servico: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
        descricao: { type: DataTypes.TEXT, allowNull: false },
        tomador_documento: { type: DataTypes.STRING(14), allowNull: false },
        tomador_nome: { type: DataTypes.STRING(300), allowNull: false },
        xml_dps: { type: DataTypes.TEXT('medium'), allowNull: false },
        xml_nfse: { type: DataTypes.TEXT('medium'), allowNull: true },
        erros: jsonColumn('erros'),
        alertas: jsonColumn('alertas'),
        BillingFileId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        UserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'nfses',
        sequelize: db,
        indexes: [
            // A mesma série + número não pode ser reusada no mesmo ambiente (a Sefin rejeitaria com E0014).
            { unique: true, fields: ['ambiente', 'serie', 'numero_dps'], name: 'nfses_ambiente_serie_numero' },
            { fields: ['chave_acesso'] },
        ],
    },
)

// Documento fiscal nunca é apagado junto com a cobrança: se ela deixar de existir, a nota fica sem vínculo.
Billing.hasMany(Nfse, { onDelete: 'SET NULL' })
Nfse.belongsTo(Billing)

export default Nfse
