import { ModelStatic, Model } from 'sequelize'

import Address from '../models/Address'
import BankAccount from '../models/BankAccount'
import BankTransfer from '../models/BankTransfer'
import Billing from '../models/Billing'
import BillingProtocol from '../models/BillingProtocol'
import Check from '../models/Check'
import Client from '../models/Client'
import Contact from '../models/Contact'
import CostCenter from '../models/CostCenter'
import Credential from '../models/Credential'
import Os_entry from '../models/Os_entry'
import Payable from '../models/Payable'
import Product from '../models/Product'
import Project from '../models/Project'
import Protocol from '../models/Protocol'
import Protocol_product from '../models/Protocol_product'
import Protocol_register from '../models/Protocol_register'
import Receipts from '../models/Receipts'
import Reimbursement from '../models/Reimbursement'
import Server from '../models/Server'
import Service_order from '../models/Service_order'
import SlaLevel from '../models/SlaLevel'
import Subproject from '../models/Subproject'
import Subscription from '../models/Subscription'
import Supplier from '../models/Supplier'

export type Action = 'list' | 'get' | 'create' | 'update' | 'delete'

export type Resource = {
    name: string
    path: string
    description: string
    actions: Action[]
    model: ModelStatic<Model>
    queryHelp?: string
}

const CRUD: Action[] = ['list', 'get', 'create', 'update', 'delete']
const NO_DELETE: Action[] = ['list', 'get', 'create', 'update']

export const resources: Resource[] = [
    { name: 'clients', path: '/clients', description: 'Clientes', actions: NO_DELETE, model: Client },
    { name: 'contacts', path: '/contacts', description: 'Contatos de clientes', actions: CRUD, model: Contact },
    { name: 'addresses', path: '/addresses', description: 'Endereços de clientes', actions: CRUD, model: Address },
    {
        name: 'credentials',
        path: '/credentials',
        description: 'Credenciais de acesso dos clientes (contém senhas — dados sensíveis)',
        actions: CRUD,
        model: Credential,
    },
    {
        name: 'projects',
        path: '/projects',
        description: 'Projetos vinculados a clientes',
        actions: NO_DELETE,
        model: Project,
        queryHelp: 'filter',
    },
    { name: 'subprojects', path: '/subprojects', description: 'Subprojetos', actions: CRUD, model: Subproject },
    {
        name: 'service_orders',
        path: '/os',
        description: 'Ordens de serviço (OS)',
        actions: NO_DELETE,
        model: Service_order,
        queryHelp: 'filter (last_three), ClientId, status, page, limit',
    },
    {
        name: 'os_entries',
        path: '/os-entries',
        description: 'Apontamentos de horas das ordens de serviço',
        actions: CRUD,
        model: Os_entry,
        queryHelp: 'serviceOrderId, status',
    },
    {
        name: 'protocols',
        path: '/protocols',
        description: 'Protocolos financeiros (acordo por OS ou assinatura)',
        actions: ['list', 'get', 'update'],
        model: Protocol,
        queryHelp: 'ClientId, status, page, limit',
    },
    {
        name: 'protocol_registers',
        path: '/protocols/registers',
        description: 'Itens de serviço dos protocolos',
        actions: CRUD,
        model: Protocol_register,
    },
    {
        name: 'protocol_products',
        path: '/protocols/products',
        description: 'Produtos vinculados aos protocolos',
        actions: CRUD,
        model: Protocol_product,
    },
    {
        name: 'protocol_receipts',
        path: '/protocols/receipts',
        description: 'Recebimentos (pagamentos) dos protocolos',
        actions: CRUD,
        model: Receipts,
    },
    {
        name: 'subscriptions',
        path: '/subscriptions',
        description: 'Assinaturas recorrentes (mensal/anual)',
        actions: NO_DELETE,
        model: Subscription,
        queryHelp: 'ClientId, complete',
    },
    {
        name: 'billings',
        path: '/billings',
        description: 'Cobranças (consolidação de protocolos em faturas por cliente)',
        actions: CRUD,
        model: Billing,
        queryHelp: 'startDate, endDate (YYYY-MM-DD), ClientId, limit',
    },
    {
        name: 'billing_protocols',
        path: '/billing-protocols',
        description: 'Vínculo entre cobrança e protocolo',
        actions: ['update'],
        model: BillingProtocol,
    },
    {
        name: 'products',
        path: '/products',
        description: 'Catálogo de produtos/serviços',
        actions: NO_DELETE,
        model: Product,
    },
    { name: 'suppliers', path: '/suppliers', description: 'Fornecedores', actions: CRUD, model: Supplier },
    { name: 'cost_centers', path: '/cost-centers', description: 'Centros de custo', actions: CRUD, model: CostCenter },
    {
        name: 'bank_accounts',
        path: '/bank-accounts',
        description: 'Contas bancárias',
        actions: CRUD,
        model: BankAccount,
    },
    {
        name: 'bank_transfers',
        path: '/bank-transfers',
        description: 'Transferências entre contas bancárias',
        actions: ['list', 'get', 'create'],
        model: BankTransfer,
    },
    {
        name: 'payables',
        path: '/payables',
        description: 'Contas a pagar',
        actions: CRUD,
        model: Payable,
        queryHelp: 'startDate, endDate (YYYY-MM-DD), supplier, costCenter',
    },
    {
        name: 'reimbursements',
        path: '/reimbursements',
        description: 'Reembolsos',
        actions: ['get', 'create', 'delete'],
        model: Reimbursement,
    },
    { name: 'checks', path: '/checks', description: 'Checagens', actions: CRUD, model: Check },
    { name: 'servers', path: '/servers', description: 'Servidores e licenças', actions: CRUD, model: Server },
    {
        name: 'sla_levels',
        path: '/sla-levels',
        description: 'Níveis de SLA',
        actions: ['list', 'create', 'update', 'delete'],
        model: SlaLevel,
    },
]

const IGNORED_FIELDS = ['id', 'createdAt', 'updatedAt', 'deletedAt']

// Descreve os campos do model para a IA saber o que enviar em create/update
export function describeFields(model: ModelStatic<Model>): string {
    const attributes = model.getAttributes()

    return Object.entries(attributes)
        .filter(([name]) => !IGNORED_FIELDS.includes(name))
        .map(([name, attr]: [string, any]) => {
            const type = attr.type?.key || String(attr.type)
            const values = attr.values ? `(${attr.values.join('|')})` : ''
            const required = attr.allowNull === false && attr.defaultValue === undefined ? '*' : ''

            return `${name}${required}: ${type}${values}`
        })
        .join(', ')
}
