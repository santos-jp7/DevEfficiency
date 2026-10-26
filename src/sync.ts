import db from './db'
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
import seedPartnerClients from './seeds/partnerClientSeed'
import Reimbursement from './models/Reimbursement'
import ReimbursementFile from './models/ReimbursementFile'
import Os_entry from './models/Os_entry'
import SlaLevel from './models/SlaLevel'
import seedSlaLevels from './seeds/slaLevelSeed'
import ClientSlaConfig from './models/ClientSlaConfig'
import Seller from './models/Seller'
import BillingFile from './models/BillingFile'
import BalanceAdjustment from './models/BalanceAdjustment'
import EmailLog from './models/EmailLog'
import Ticket from './models/Ticket'
import TicketMessage from './models/TicketMessage'
import BankStatementImport from './models/BankStatementImport'
import BankStatementEntry from './models/BankStatementEntry'

// O `sync({ alter })` do Sequelize não amplia ENUMs já existentes no MySQL. Quando um valor novo é
// acrescentado ao model, esta função (idempotente) atualiza a coluna sem mexer em nulidade/default.
async function ensureEnumValues(table: string, column: string, values: readonly string[]) {
    const [rows] = (await db.query(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`)) as any[]
    const current = rows?.[0]
    if (!current) return

    const existing = [...String(current.Type).matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"))
    if (values.every((v) => existing.includes(v))) return

    // Mantém os valores atuais (ordem preservada) e acrescenta os novos.
    const merged = [...existing, ...values.filter((v) => !existing.includes(v))]
    const list = merged.map((v) => db.escape(v)).join(', ')
    const nullable = current.Null === 'YES' ? 'NULL' : 'NOT NULL'
    const fallback = current.Default !== null && current.Default !== undefined ? ` DEFAULT ${db.escape(current.Default)}` : ''

    await db.query(`ALTER TABLE \`${table}\` MODIFY \`${column}\` ENUM(${list}) ${nullable}${fallback}`)
}

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
    await ensureEnumValues('service_orders', 'status', ['Backlog'])
    await Os_entry.sync({ alter: { drop: false } })

    await Subscription.sync({ alter: { drop: false } })

    await License.sync({ alter: { drop: false } })

    // Vendedor referencia centro de custo; protocolo e contas a pagar referenciam vendedor.
    await CostCenter.sync()
    await Seller.sync({ alter: { drop: false } })

    await Protocol.sync({ alter: { drop: false } })
    await Protocol_register.sync({ alter: { drop: false } })
    await Protocol_product.sync({ alter: { drop: false } })

    await BankAccount.sync({ alter: { drop: false } })
    await BankTransfer.sync({ alter: { drop: false } })

    await Billing.sync({ alter: { drop: false } })
    await BillingProtocol.sync({ alter: { drop: false } })
    await BillingFile.sync({ alter: { drop: false } })

    await CostCenter.sync()
    await Supplier.sync()

    await Receipts.sync({ alter: { drop: false } })
    await Payable.sync({ alter: { drop: false } })

    await Config.sync({ alter: { drop: false } })
    await seedConfigs()
    await seedPartnerClients()

    await BankStatementImport.sync({ alter: { drop: false } })
    await BankStatementEntry.sync({ alter: { drop: false } })

    await BalanceAdjustment.sync({ alter: { drop: false } })
    await EmailLog.sync({ alter: { drop: false } })
    await Ticket.sync({ alter: { drop: false } })
    await TicketMessage.sync({ alter: { drop: false } })

    await Reimbursement.sync({ alter: { drop: false } })
    await ReimbursementFile.sync({ alter: { drop: false } })

    return true
}

export default syncModels
