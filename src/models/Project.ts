import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    DataTypes,
    NonAttribute,
    HasManyGetAssociationsMixin,
    HasManyCreateAssociationMixin,
    Association
} from "sequelize";

import db from "../db";

import Client from "./Client";
import ServiceOrder from "./ServiceOrder";
import Subproject from "./Subproject";

class Project extends Model<
    InferAttributes<Project>,
    InferCreationAttributes<Project>
>{
    declare id: CreationOptional<number>;
    declare name: string; 
    declare url: string;
    declare type: "API" | "Bot" | "WebSite" | "Automação" | "Crawler"

    declare clientId: ForeignKey<Client["id"]>;

    declare getSubproject: HasManyGetAssociationsMixin<Subproject>;
    declare createSubproject: HasManyCreateAssociationMixin<Subproject, 'projectId'>;

    declare getServiceOrder: HasManyGetAssociationsMixin<ServiceOrder>;
    declare createServiceOrder: HasManyCreateAssociationMixin<ServiceOrder, 'projectId'>;
    
    declare subprojects : NonAttribute<Subproject[]>;
    declare serviceOrders : NonAttribute<ServiceOrder[]>;

    declare static associations: {
        subprojects: Association<Project, Subproject>;
        serviceOrders: Association<Project, ServiceOrder>;
    };

    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

Project.init({
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(128),
    },
    url: {
        type: DataTypes.STRING,

    },
    type: {
        type: DataTypes.ENUM,
        values: ["API", "Bot", "WebSite", "Automação", "Crawler"]
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
}, {
    tableName: "projects",
    sequelize: db
})

Project.hasMany(Subproject, {
    sourceKey: "id",
    foreignKey: "projectId",
    as: "subprojects"
});

Project.hasMany(ServiceOrder, {
    sourceKey: "id",
    foreignKey: "projectId",
    as: "serviceOrders"
});

export default Project;