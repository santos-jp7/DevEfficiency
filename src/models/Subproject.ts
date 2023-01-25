import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    DataTypes,
    NonAttribute,
} from 'sequelize'

import db from '../db'

import Project from './Project'

class Subproject extends Model<InferAttributes<Subproject>, InferCreationAttributes<Subproject>> {
    declare id: CreationOptional<number>
    declare name: string
    declare url: string
    declare type: 'Front-End' | 'Back-End' | 'Bot' | 'Outros'

    declare ProjectId: ForeignKey<Project['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Subproject.init(
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
        url: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM,
            values: ['Front-End', 'Back-End', 'Bot', 'Outros'],
            allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'subprojects',
        sequelize: db,
    },
)

export default Subproject
