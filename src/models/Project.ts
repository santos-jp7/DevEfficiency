import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    DataTypes,
    NonAttribute
} from "sequelize";

import db from "../db";

import Client from "./Client";

class Project extends Model<
    InferAttributes<Project>,
    InferCreationAttributes<Project>
>{
    declare id: CreationOptional<number>;
    declare name: string; 
    declare github: string;
    declare type: "API" | "Bot" | "WebSite" | "Automação"

    declare clientId: ForeignKey<Client["id"]>;

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
    github: {
        type: DataTypes.STRING,

    },
    type: {
        type: DataTypes.ENUM,
        values: ["API", "Bot", "WebSite", "Automação"]
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
}, {
    tableName: "projects",
    sequelize: db
})

export default Project;