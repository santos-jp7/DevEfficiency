import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    DataTypes,
    ForeignKey,
} from 'sequelize'
import db from '../db'
import Service_order from './Service_order'

class Os_entry extends Model<InferAttributes<Os_entry>, InferCreationAttributes<Os_entry>> {
    declare id: CreationOptional<number>
    declare description: string
    declare public: CreationOptional<boolean>
    declare date: string
    declare status: 'Em andamento' | 'Finalizado'

    declare ServiceOrderId: ForeignKey<Service_order['id']>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

Os_entry.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        description: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        public: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        date: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM('Em andamento', 'Finalizado'),
            allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        tableName: 'os_entries',
        sequelize: db,
    },
)

Service_order.hasMany(Os_entry, { onDelete: 'CASCADE' })
Os_entry.belongsTo(Service_order)

export default Os_entry
