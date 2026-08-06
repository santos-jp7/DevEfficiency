import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    DataTypes,
} from 'sequelize'
import db from '../db'

class SlaLevel extends Model<InferAttributes<SlaLevel>, InferCreationAttributes<SlaLevel>> {
    declare id: CreationOptional<number>
    declare name: string
    declare category: string
    declare response_hours: number
    declare solution_hours: number
    declare active: CreationOptional<boolean>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

SlaLevel.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(128),
            allowNull: false,
        },
        category: {
            type: DataTypes.STRING(64),
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
        active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'sla_levels',
        sequelize: db,
    },
)

export default SlaLevel
