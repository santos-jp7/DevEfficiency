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
import License from './models/License'
import Subscription from './models/Subscription'

async function syncModels(): Promise<true> {
    await User.sync()

    await Client.sync({ alter: { drop: false } })

    await Product.sync({ alter: { drop: false } })

    await Contact.sync()
    await Credential.sync()
    await Server.sync()

    await Project.sync({ alter: { drop: false } })
    await Subproject.sync()
    await Check.sync()

    await Service_order.sync()
    await Subscription.sync({ alter: { drop: false } })

    await License.sync({ alter: { drop: false } })

    await Protocol.sync({ alter: { drop: false } })
    await Protocol_register.sync()
    await Protocol_product.sync({ alter: { drop: false } })

    await Receipts.sync()

    return true
}

export default syncModels
