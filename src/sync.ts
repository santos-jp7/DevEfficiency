import fs from 'fs'
import path from 'path'

import User from './models/User'
import Client from './models/Client'
import Credential from './models/Credential'
import Project from './models/Project'
import Subproject from './models/Subproject'
import ServiceOrder from './models/Service_order'
import Protocol from './models/Protocol'
import Protocol_register from './models/Protocol_register'
import Received from './models/Received'

async function syncModels(): Promise<void> {
    // const files = fs.readdirSync(path.resolve("src", "models"));

    // files.forEach((modelName) => {
    //     require(`./models/${modelName}`).default.sync({alter: true});
    // });

    await User.sync({ alter: true })
    await Client.sync({ alter: true })
    await Project.sync({ alter: true })
    await Subproject.sync({ alter: true })
    await Credential.sync({ alter: true })
    await Protocol_register.sync({ alter: true })
    await Received.sync({ alter: true })
    await Protocol.sync({ alter: true })
    await ServiceOrder.sync({ alter: true })
}

export default syncModels
