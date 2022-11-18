import {
    Model,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    DataTypes
} from "sequelize";

import db from "../db";

class User extends Model<
    InferAttributes<User>,
    InferCreationAttributes<User>
>{
    declare id: CreationOptional<number>;
    declare username: string; 
    declare password: string;

    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
}

User.init({
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    username: {
        type: DataTypes.STRING(128),
    },
    password: {
        type: DataTypes.STRING(128),
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE
}, {
    tableName: "users",
    sequelize: db
})

export default User;