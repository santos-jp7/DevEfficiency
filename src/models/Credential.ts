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

class Credential extends Model<
    InferAttributes<Credential>,
    InferCreationAttributes<Credential>
>{
    declare id: CreationOptional<number>;
    declare description: string; 
    declare host: string;
    declare username: string;
    declare password: string;

    declare clientId: ForeignKey<Client["id"]>;

    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

Credential.init({
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    description: {
        type: DataTypes.STRING(128),
        allowNull: false
    },
    host: {
        type: DataTypes.STRING(128),
        allowNull: false
    },
    username: {
        type: DataTypes.STRING(128),
        allowNull: false
    },
    password: {
        type: DataTypes.STRING(128),
        allowNull: false
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
}, {
    tableName: "credentials",
    sequelize: db
})

export default Credential;