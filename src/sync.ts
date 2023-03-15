import fs from 'fs'
import path from 'path'

import User from './models/User'
import Client from './models/Client'
import Credential from './models/Credential'
import Project from './models/Project'
import Subproject from './models/Subproject'
import Service_order from './models/Service_order'
import Protocol from './models/Protocol'
import Protocol_register from './models/Protocol_register'
import Receipts from './models/Receipts'
import Product from './models/Product'
import Protocol_product from './models/Protocol_product'
import Server from './models/Server'
import Contact from './models/Contact'
import Check from './models/Check'

async function syncModels(): Promise<true> {
    // const files = fs.readdirSync(path.resolve("src", "models"));

    // files.forEach((modelName) => {
    //     require(`./models/${modelName}`).default.sync({alter: true});
    // });

    await User.sync()

    await Client.sync()

    await Product.sync()

    await Contact.sync()
    await Credential.sync()
    await Server.sync()

    await Project.sync()
    await Subproject.sync()
    await Check.sync()

    await Service_order.sync()
    await Protocol.sync()
    await Protocol_register.sync()
    await Protocol_product.sync()

    await Receipts.sync()

    return true
}

export default syncModels
