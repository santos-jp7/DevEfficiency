import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    DataTypes,
    ForeignKey,
} from 'sequelize'
import db from '../db'
import Reimbursement from './Reimbursement'

class ReimbursementFile extends Model<InferAttributes<ReimbursementFile>, InferCreationAttributes<ReimbursementFile>> {
    declare id: CreationOptional<number>
    declare filename: string
    declare url: string

    declare ReimbursementId: ForeignKey<Reimbursement['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

ReimbursementFile.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        filename: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        url: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'reimbursement_files',
        sequelize: db,
    },
)

Reimbursement.hasMany(ReimbursementFile, { onDelete: 'CASCADE' })
ReimbursementFile.belongsTo(Reimbursement)

export default ReimbursementFile
