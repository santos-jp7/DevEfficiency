import fs from "fs";
import path from "path";

function syncModels() : void{
    const files = fs.readdirSync(path.resolve("src", "models"));

    files.forEach((modelName) => {
        require(`./models/${modelName}`).default.sync();
    });
}

export default syncModels;