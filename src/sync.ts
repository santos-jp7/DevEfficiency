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
import Address from './models/Address'
import Check from './models/Check'
import License from './models/License'
import Subscription from './models/Subscription'
import Billing from './models/Billing'
import BillingProtocol from './models/BillingProtocol'
import BankAccount from './models/BankAccount'
import CostCenter from './models/CostCenter'
import Supplier from './models/Supplier'
import Payable from './models/Payable'
import BankTransfer from './models/BankTransfer'
import Config from './models/Config'
import seedConfigs from './seeds/configSeed'
import Reimbursement from './models/Reimbursement'
import ReimbursementFile from './models/ReimbursementFile'
import Os_entry from './models/Os_entry'
import SlaLevel from './models/SlaLevel'
import seedSlaLevels from './seeds/slaLevelSeed'
import ClientSlaConfig from './models/ClientSlaConfig'

async function syncModels(): Promise<true> {
    await User.sync()

    await Client.sync({ alter: { drop: false } })
    await ClientSlaConfig.sync({ alter: { drop: false } })

    await Product.sync({ alter: { drop: false } })

    await Contact.sync()
    await Address.sync()
    await Credential.sync()
    await Server.sync()

    await Project.sync({ alter: { drop: false } })
    await Subproject.sync()
    await Check.sync()

    await SlaLevel.sync({ alter: { drop: false } })
    await seedSlaLevels()

    await Service_order.sync({ alter: { drop: false } })
    await Os_entry.sync({ alter: { drop: false } })

    await Subscription.sync({ alter: { drop: false } })

    await License.sync({ alter: { drop: false } })

    await Protocol.sync({ alter: { drop: false } })
    await Protocol_register.sync()
    await Protocol_product.sync({ alter: { drop: false } })

    await BankAccount.sync({ alter: { drop: false } })
    await BankTransfer.sync({ alter: { drop: false } })

    await Billing.sync({ alter: { drop: false } })
    await BillingProtocol.sync({ alter: { drop: false } })

    await CostCenter.sync()
    await Supplier.sync()

    await Receipts.sync({ alter: { drop: false } })
    await Payable.sync()

    await Config.sync({ alter: { drop: false } })
    await seedConfigs()

    await Reimbursement.sync({ alter: { drop: false } })
    await ReimbursementFile.sync({ alter: { drop: false } })

    return true
}

export default syncModels
