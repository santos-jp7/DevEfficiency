import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    DataTypes
} from "sequelize";

import db from "../db";

import Project from "./Project";

class ServiceOrder extends Model<
    InferAttributes<ServiceOrder>,
    InferCreationAttributes<ServiceOrder>
>{
    declare id: CreationOptional<number>;
    declare subject: string; 
    declare description: string;
    declare status: "Em avaliação" | "Em correções" | "Pendente" | "Finalizado"

    declare projectId: ForeignKey<Project["id"]>;

    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

ServiceOrder.init({
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    subject: {
        type: DataTypes.STRING(128),
    },
    description: {
        type: DataTypes.STRING,

    },
    status: {
        type: DataTypes.ENUM,
        values: ["Em avaliação", "Em correções", "Pendente", "Finalizado"]
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
}, {
    tableName: "serviceOrders",
    sequelize: db
})

export default ServiceOrder;