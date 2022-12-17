import fs from "fs";
import path from "path";

import Client from "./models/Client";
import Credential from "./models/Credential";
import Project from "./models/Project";
import User from "./models/User";


async function syncModels() : Promise<void>{
    // const files = fs.readdirSync(path.resolve("src", "models"));

    // files.forEach((modelName) => {
    //     require(`./models/${modelName}`).default.sync({alter: true});
    // });

    await User.sync({alter: true});
    await Client.sync({alter: true});
    await Project.sync({alter: true});
    await Credential.sync({alter: true});

}

export default syncModels;