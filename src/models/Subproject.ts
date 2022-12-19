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

import Project from "./Project";

class Subproject extends Model<
    InferAttributes<Subproject>,
    InferCreationAttributes<Subproject>
>{
    declare id: CreationOptional<number>;
    declare name: string; 
    declare url: string;
    declare type: "Front-End" | "Back-End" | "Bot" | "Outros"

    declare projectId: ForeignKey<Project["id"]>;

    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

Subproject.init({
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
        values: ["Front-End", "Back-End", "Bot" , "Outros"]
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
}, {
    tableName: "subprojects",
    sequelize: db
})

export default Subproject;