import { Model, InferAttributes, InferCreationAttributes, CreationOptional, DataTypes } from 'sequelize'

import db from '../db'

// Registro de e-mails automáticos enviados a clientes (lembretes, etapas da OS, chamados).
// Serve de auditoria e de trava contra envio duplicado (kind + ref + stage).
class EmailLog extends Model<InferAttributes<EmailLog>, InferCreationAttributes<EmailLog>> {
    declare id: CreationOptional<number>
    declare kind: string
    declare ref_type: string
    declare ref_id: number
    declare stage: CreationOptional<string | null>
    declare to: string
    declare subject: string
    // teste = redirecionado ao destinatário de teste (modo test); ignorado = não enviado (modo off / sem e-mail)
    declare status: 'enviado' | 'falhou' | 'ignorado' | 'teste'
    declare channel: CreationOptional<string | null>
    declare error: CreationOptional<string | null>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

EmailLog.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        kind: { type: DataTypes.STRING(40), allowNull: false },
        ref_type: { type: DataTypes.STRING(40), allowNull: false },
        ref_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        stage: { type: DataTypes.STRING(60), allowNull: true },
        to: { type: DataTypes.STRING(512), allowNull: false },
        subject: { type: DataTypes.STRING(255), allowNull: false },
        status: { type: DataTypes.ENUM('enviado', 'falhou', 'ignorado', 'teste'), allowNull: false },
        channel: { type: DataTypes.STRING(20), allowNull: true },
        error: { type: DataTypes.TEXT, allowNull: true },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'email_logs',
        sequelize: db,
        indexes: [{ name: 'idx_email_log_ref', fields: ['kind', 'ref_type', 'ref_id'] }],
    },
)

export default EmailLog
