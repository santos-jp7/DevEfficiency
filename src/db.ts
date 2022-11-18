
import {Sequelize} from "sequelize";

const db = new Sequelize(
    String(process.env.DB_NAME),
    String(process.env.DB_USER),
    String(process.env.DB_PASS), {
        host: String(process.env.DB_HOST),
        dialect: "mysql",
        pool: {
            max: 5,
            min: 0,
            idle: 10000
        },
        logging: console.log
    });

export default db;