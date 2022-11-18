import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    HasManyGetAssociationsMixin,
    NonAttribute,
    DataTypes,
    HasManyCreateAssociationMixin,
    Association
} from "sequelize";

import db from "../db";

import Credential from "./Credential";

class Client extends Model<
    InferAttributes<Client>,
    InferCreationAttributes<Client>
>{
    declare id: CreationOptional<number>;
    declare name: string;

    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    declare getCredential: HasManyGetAssociationsMixin<Credential>;
    declare createCredential: HasManyCreateAssociationMixin<Credential, 'clientId'>;
    
    declare credentials : NonAttribute<Credential[]>;

    declare static associations: { 
        credentials: Association<Client, Credential>;
    };
}

Client.init({
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(128),
        allowNull: false
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
}, {
    tableName: "clients",
    sequelize: db
})

Client.hasMany(Credential, {
        sourceKey: "id",
        foreignKey: "clientId",
        as: "credentials"
    });

export default Client;