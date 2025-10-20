import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    DataTypes,
    ForeignKey,
    NonAttribute,
    Association,
    HasManyGetAssociationsMixin,
    HasManyCreateAssociationMixin,
} from 'sequelize'
import db from '../db'

class CostCenter extends Model<
    InferAttributes<CostCenter, { omit: 'children' | 'parent' }>,
    InferCreationAttributes<CostCenter>
> {
    declare id: CreationOptional<number>
    declare name: string
    declare description: CreationOptional<string>

    declare ParentId: ForeignKey<CostCenter['id']> | null

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    // Associations
    declare parent: NonAttribute<CostCenter>
    declare children: NonAttribute<CostCenter[]>

    declare getChildren: HasManyGetAssociationsMixin<CostCenter>
    declare createChild: HasManyCreateAssociationMixin<CostCenter, 'ParentId'>

    declare static associations: {
        children: Association<CostCenter, CostCenter>
        parent: Association<CostCenter, CostCenter>
    }
}

CostCenter.init(
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
        description: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'cost_centers',
        sequelize: db,
    },
)

// Self-referencing association for parent-child hierarchy
CostCenter.hasMany(CostCenter, { as: 'children', foreignKey: 'ParentId', onDelete: 'CASCADE' })
CostCenter.belongsTo(CostCenter, { as: 'parent', foreignKey: 'ParentId' })

export default CostCenter
