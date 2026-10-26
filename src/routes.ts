import { FastifyPluginCallback } from 'fastify'

import helloController from './controllers/helloController'
import clientController from './controllers/clientController'
import credentialsController from './controllers/credentialsController'
import authController from './controllers/authController'
import projectsController from './controllers/projectsController'
import subprojectsController from './controllers/subprojectsController'
import serviceOrdersController from './controllers/serviceOrdersController'
import protocolsController from './controllers/protocolsController'
import protocolsRegisterController from './controllers/protocolsRegisterController'
import receiptsController from './controllers/receiptsController'
import productsController from './controllers/productsController'
import protocolsProductController from './controllers/protocolsProductController'

import isAuthed from './middlewares/isAuthed'
import currentOs from './utils/currentOs'
import serversController from './controllers/serversController'
import contactsController from './controllers/contactsController'
import checksController from './controllers/checksController'
import subscriptionController from './controllers/subscriptionsController'
import billingController from './controllers/billingController'
import billingProtocolController from './controllers/billingProtocolController'
import billingReceipt from './utils/billingReceipt'
import { sendBillingEmail } from './utils/sendBillingEmail'
import costCenterController from './controllers/costCenterController'
import supplierController from './controllers/supplierController'
import bankAccountController from './controllers/bankAccountController'
import payablesController from './controllers/payablesController'
import financialsController from './controllers/financialsController'
import expenseReportController from './controllers/expenseReportController'
import bankTransferController from './controllers/bankTransferController'
import addressController from './controllers/addressController'
import configController from './controllers/configController' // Import the new controller
import pricingController from './controllers/pricingController'
import dreReportController from './controllers/dreReportController'
import osEntriesController from './controllers/osEntriesController'
import reimbursementsController from './controllers/reimbursementsController'
import slaController from './controllers/slaController'
import clientSlaConfigController from './controllers/clientSlaConfigController'
import sellersController from './controllers/sellersController'
import reconciliationController from './controllers/reconciliationController'
import payablesAlertController from './controllers/payablesAlertController'
import commercialReportsController from './controllers/commercialReportsController'
import balanceController from './controllers/balanceController'
import ticketsController from './controllers/ticketsController'
import { runBillingReminders, sendBillingReminder } from './utils/billingReminders'
import Billing from './models/Billing'
import mcp from './mcp/server'

const routes: FastifyPluginCallback = (instance, opts, next) => {
    instance.get('/', helloController.handler)

    instance.register(mcp)

    instance.post('/auth', authController.auth)
    instance.post('/auth/refresh', authController.auth)
    instance.get('/auth/verify', { preHandler: [isAuthed] }, authController.verify)

    instance.get('/pricing/preview', { preHandler: [isAuthed] }, pricingController.preview as any)

    instance.get('/config', { preHandler: [isAuthed] }, configController.index)
    instance.get('/config/:type', { preHandler: [isAuthed] }, configController.show)
    instance.post('/config/:type', { preHandler: [isAuthed] }, configController.store)

    instance.get('/financial-history', { preHandler: [isAuthed] }, financialsController.index)
    instance.get('/reports/delinquency', { preHandler: [isAuthed] }, commercialReportsController.delinquency as any)
    instance.get('/reports/sales', { preHandler: [isAuthed] }, commercialReportsController.sales as any)
    instance.get('/reports/recurrence', { preHandler: [isAuthed] }, commercialReportsController.recurrence as any)
    instance.get('/dre-report', { preHandler: [isAuthed] }, dreReportController.index)
    instance.get('/expense-report', { preHandler: [isAuthed] }, expenseReportController.index)
    instance.get('/financial-comparison', { preHandler: [isAuthed] }, expenseReportController.comparison)

    instance.get('/bank-transfers', { preHandler: [isAuthed] }, bankTransferController.index)
    instance.get('/bank-transfers/:id', { preHandler: [isAuthed] }, bankTransferController.show)
    instance.post('/bank-transfers', { preHandler: [isAuthed] }, bankTransferController.store)

    instance.get('/cost-centers', { preHandler: [isAuthed] }, costCenterController.index)
    instance.get('/cost-centers/:id', { preHandler: [isAuthed] }, costCenterController.show)
    instance.post('/cost-centers', { preHandler: [isAuthed] }, costCenterController.store)
    instance.put('/cost-centers/:id', { preHandler: [isAuthed] }, costCenterController.update)
    instance.delete('/cost-centers/:id', { preHandler: [isAuthed] }, costCenterController.destroy)

    instance.get('/suppliers', { preHandler: [isAuthed] }, supplierController.index)
    instance.get('/suppliers/:id', { preHandler: [isAuthed] }, supplierController.show)
    instance.post('/suppliers', { preHandler: [isAuthed] }, supplierController.store)
    instance.put('/suppliers/:id', { preHandler: [isAuthed] }, supplierController.update)
    instance.delete('/suppliers/:id', { preHandler: [isAuthed] }, supplierController.destroy)

    instance.get('/bank-accounts/balance-check', { preHandler: [isAuthed] }, balanceController.index as any)
    instance.post('/bank-accounts/balance-check/alert', { preHandler: [isAuthed] }, balanceController.alertNow as any)
    instance.get('/bank-accounts/:id/balance-check', { preHandler: [isAuthed] }, balanceController.show as any)
    instance.get('/bank-accounts/:id/ledger', { preHandler: [isAuthed] }, balanceController.ledger as any)
    instance.post('/bank-accounts/:id/opening-balance', { preHandler: [isAuthed] }, balanceController.setOpening as any)
    instance.post('/bank-accounts/:id/fix-balance', { preHandler: [isAuthed] }, balanceController.fix as any)
    instance.get('/bank-accounts', { preHandler: [isAuthed] }, bankAccountController.index)
    instance.get('/bank-accounts/:id', { preHandler: [isAuthed] }, bankAccountController.show)
    instance.post('/bank-accounts', { preHandler: [isAuthed] }, bankAccountController.store)
    instance.put('/bank-accounts/:id', { preHandler: [isAuthed] }, bankAccountController.update)
    instance.delete('/bank-accounts/:id', { preHandler: [isAuthed] }, bankAccountController.destroy)

    instance.get('/payables', { preHandler: [isAuthed] }, payablesController.index)
    instance.get('/payables/:id', { preHandler: [isAuthed] }, payablesController.show)
    instance.post('/payables', { preHandler: [isAuthed] }, payablesController.store)
    instance.put('/payables/:id', { preHandler: [isAuthed] }, payablesController.update)
    instance.delete('/payables/:id', { preHandler: [isAuthed] }, payablesController.destroy)

    instance.get('/sellers', { preHandler: [isAuthed] }, sellersController.index as any)
    instance.get('/sellers/:id', { preHandler: [isAuthed] }, sellersController.show as any)
    instance.get('/sellers/:id/report', { preHandler: [isAuthed] }, sellersController.report as any)
    instance.get('/sellers/:id/upcoming', { preHandler: [isAuthed] }, sellersController.upcoming as any)
    instance.post('/sellers', { preHandler: [isAuthed] }, sellersController.store as any)
    instance.put('/sellers/:id', { preHandler: [isAuthed] }, sellersController.update as any)
    instance.delete('/sellers/:id', { preHandler: [isAuthed] }, sellersController.destroy as any)

    instance.get('/reconciliation/entries', { preHandler: [isAuthed] }, reconciliationController.entries as any)
    instance.get('/reconciliation/summary', { preHandler: [isAuthed] }, reconciliationController.summary as any)
    instance.get('/reconciliation/imports', { preHandler: [isAuthed] }, reconciliationController.imports as any)
    instance.get('/reconciliation/unreconciled', { preHandler: [isAuthed] }, reconciliationController.unreconciled as any)
    instance.get('/reconciliation/status', { preHandler: [isAuthed] }, reconciliationController.status as any)
    instance.post('/reconciliation/import', { preHandler: [isAuthed] }, reconciliationController.import as any)
    instance.post('/reconciliation/auto-match', { preHandler: [isAuthed] }, reconciliationController.autoMatch as any)
    instance.post('/reconciliation/entries/:id/match', { preHandler: [isAuthed] }, reconciliationController.match as any)
    instance.post('/reconciliation/entries/:id/unmatch', { preHandler: [isAuthed] }, reconciliationController.unmatch as any)
    instance.post('/reconciliation/entries/:id/ignore', { preHandler: [isAuthed] }, reconciliationController.ignore as any)
    instance.post('/reconciliation/entries/:id/unignore', { preHandler: [isAuthed] }, reconciliationController.unignore as any)

    instance.post('/payables-alert/send', { preHandler: [isAuthed] }, payablesAlertController.send)

    instance.get('/tickets', { preHandler: [isAuthed] }, ticketsController.index as any)
    instance.get('/tickets/summary', { preHandler: [isAuthed] }, ticketsController.summary as any)
    instance.get('/tickets/:id', { preHandler: [isAuthed] }, ticketsController.show as any)
    instance.post('/tickets', { preHandler: [isAuthed] }, ticketsController.store as any)
    instance.put('/tickets/:id', { preHandler: [isAuthed] }, ticketsController.update as any)
    instance.post('/tickets/:id/messages', { preHandler: [isAuthed] }, ticketsController.message as any)
    instance.post('/tickets/:id/status', { preHandler: [isAuthed] }, ticketsController.status as any)
    instance.post('/tickets/:id/convert', { preHandler: [isAuthed] }, ticketsController.convert as any)

    instance.get('/clients', { preHandler: [isAuthed] }, clientController.index)
    instance.get('/clients/:id', { preHandler: [isAuthed] }, clientController.show)
    instance.post('/clients', { preHandler: [isAuthed] }, clientController.store)
    instance.put('/clients/:id', { preHandler: [isAuthed] }, clientController.update)

    instance.get('/clients/:id/sla-configs', { preHandler: [isAuthed] }, clientSlaConfigController.index as any)
    instance.post('/clients/:id/sla-configs', { preHandler: [isAuthed] }, clientSlaConfigController.store as any)
    instance.delete('/clients/:id/sla-configs/:configId', { preHandler: [isAuthed] }, clientSlaConfigController.destroy as any)

    instance.get('/contacts', { preHandler: [isAuthed] }, contactsController.index)
    instance.get('/contacts/:id', { preHandler: [isAuthed] }, contactsController.show)
    instance.post('/contacts', { preHandler: [isAuthed] }, contactsController.store)
    instance.put('/contacts/:id', { preHandler: [isAuthed] }, contactsController.update)
    instance.delete('/contacts/:id', { preHandler: [isAuthed] }, contactsController.destroy)

    instance.get('/addresses', { preHandler: [isAuthed] }, addressController.index)
    instance.get('/addresses/:id', { preHandler: [isAuthed] }, addressController.show)
    instance.post('/addresses', { preHandler: [isAuthed] }, addressController.store)
    instance.put('/addresses/:id', { preHandler: [isAuthed] }, addressController.update)
    instance.delete('/addresses/:id', { preHandler: [isAuthed] }, addressController.delete)

    instance.get('/credentials', { preHandler: [isAuthed] }, credentialsController.index)
    instance.get('/credentials/:id', { preHandler: [isAuthed] }, credentialsController.show)
    instance.post('/credentials', { preHandler: [isAuthed] }, credentialsController.store)
    instance.put('/credentials/:id', { preHandler: [isAuthed] }, credentialsController.update)
    instance.delete('/credentials/:id', { preHandler: [isAuthed] }, credentialsController.destroy)

    instance.get('/projects', { preHandler: [isAuthed] }, projectsController.index)
    instance.get('/projects/:id', { preHandler: [isAuthed] }, projectsController.show)
    instance.post('/projects', { preHandler: [isAuthed] }, projectsController.store)
    instance.put('/projects/:id', { preHandler: [isAuthed] }, projectsController.update)

    instance.get('/products', { preHandler: [isAuthed] }, productsController.index)
    instance.get('/products/:id', { preHandler: [isAuthed] }, productsController.show)
    instance.post('/products', { preHandler: [isAuthed] }, productsController.store)
    instance.put('/products/:id', { preHandler: [isAuthed] }, productsController.update)

    instance.get('/subprojects', { preHandler: [isAuthed] }, subprojectsController.index)
    instance.get('/subprojects/:id', { preHandler: [isAuthed] }, subprojectsController.show)
    instance.post('/subprojects', { preHandler: [isAuthed] }, subprojectsController.store)
    instance.put('/subprojects/:id', { preHandler: [isAuthed] }, subprojectsController.update)
    instance.delete('/subprojects/:id', { preHandler: [isAuthed] }, subprojectsController.destroy)

    instance.get('/os', { preHandler: [isAuthed] }, serviceOrdersController.index)
    instance.get('/os/:id', { preHandler: [isAuthed] }, serviceOrdersController.show)
    instance.post('/os', { preHandler: [isAuthed] }, serviceOrdersController.store)
    instance.put('/os/:id', { preHandler: [isAuthed] }, serviceOrdersController.update)

    instance.get('/os/:id/pdf', serviceOrdersController.pdf)
    instance.get('/os/:id/invoice-pdf', serviceOrdersController.invoicePdf)

    instance.get('/protocols', { preHandler: [isAuthed] }, protocolsController.index)
    instance.post('/protocols/standalone', { preHandler: [isAuthed] }, protocolsController.storeStandalone)
    instance.get('/protocols/:id', { preHandler: [isAuthed] }, protocolsController.show)
    instance.put('/protocols/:id', { preHandler: [isAuthed] }, protocolsController.update)

    instance.get('/protocols/registers', { preHandler: [isAuthed] }, protocolsRegisterController.index)
    instance.get('/protocols/registers/:id', { preHandler: [isAuthed] }, protocolsRegisterController.show)
    instance.post('/protocols/registers', { preHandler: [isAuthed] }, protocolsRegisterController.store)
    instance.put('/protocols/registers/:id', { preHandler: [isAuthed] }, protocolsRegisterController.update)
    instance.delete('/protocols/registers/:id', { preHandler: [isAuthed] }, protocolsRegisterController.destroy)

    instance.get('/protocols/pdf', protocolsController.pdf)

    instance.get('/protocols/products', { preHandler: [isAuthed] }, protocolsProductController.index)
    instance.get('/protocols/products/:id', { preHandler: [isAuthed] }, protocolsProductController.show)
    instance.post('/protocols/products', { preHandler: [isAuthed] }, protocolsProductController.store)
    instance.put('/protocols/products/:id', { preHandler: [isAuthed] }, protocolsProductController.update)
    instance.delete('/protocols/products/:id', { preHandler: [isAuthed] }, protocolsProductController.destroy)

    instance.get('/protocols/receipts', { preHandler: [isAuthed] }, receiptsController.index)
    instance.get('/protocols/receipts/:id', { preHandler: [isAuthed] }, receiptsController.show)
    instance.post('/protocols/receipts', { preHandler: [isAuthed] }, receiptsController.store)
    instance.put('/protocols/receipts/:id', { preHandler: [isAuthed] }, receiptsController.update)
    instance.delete('/protocols/receipts/:id', { preHandler: [isAuthed] }, receiptsController.destroy)

    instance.get('/servers', { preHandler: [isAuthed] }, serversController.index)
    instance.get('/servers/:id', { preHandler: [isAuthed] }, serversController.show)
    instance.post('/servers', { preHandler: [isAuthed] }, serversController.store)
    instance.put('/servers/:id', { preHandler: [isAuthed] }, serversController.update)
    instance.delete('/servers/:id', { preHandler: [isAuthed] }, serversController.destroy)

    instance.get('/checks', { preHandler: [isAuthed] }, checksController.index)
    instance.get('/checks/:id', { preHandler: [isAuthed] }, checksController.show)
    instance.post('/checks', { preHandler: [isAuthed] }, checksController.store)
    instance.put('/checks/:id', { preHandler: [isAuthed] }, checksController.update)
    instance.delete('/checks/:id', { preHandler: [isAuthed] }, checksController.destroy)

    instance.get('/subscriptions', { preHandler: [isAuthed] }, subscriptionController.index)
    instance.get('/subscriptions/:id', { preHandler: [isAuthed] }, subscriptionController.show)
    instance.post('/subscriptions', { preHandler: [isAuthed] }, subscriptionController.store)
    instance.put('/subscriptions/:id', { preHandler: [isAuthed] }, subscriptionController.update)

    instance.get('/billings', { preHandler: [isAuthed] }, billingController.index)
    instance.get('/billings/:id', { preHandler: [isAuthed] }, billingController.show)
    instance.post('/billings', { preHandler: [isAuthed] }, billingController.store)
    instance.put('/billings/:id', { preHandler: [isAuthed] }, billingController.update)
    instance.delete('/billings/:id', { preHandler: [isAuthed] }, billingController.destroy)
    instance.get('/billings/:id/pdf', billingController.pdf)
    instance.post('/billings/:id/upload', { preHandler: [isAuthed] }, billingController.upload as any)
    instance.post('/billings/:id/send-email', { preHandler: [isAuthed] }, async (req: any, res) => {
        try {
            await sendBillingEmail(parseInt(req.params.id))
            return res.send({ message: 'Email enviado com sucesso' })
        } catch (err: any) {
            return res.status(400).send({ message: err.message || 'Erro ao enviar email' })
        }
    })

    instance.post('/billings/:id/send-reminder', { preHandler: [isAuthed] }, async (req: any, res) => {
        const billing = await Billing.findByPk(parseInt(req.params.id))
        if (!billing) return res.status(404).send({ message: 'Cobrança não encontrada' })
        if (billing.status !== 'faturada') return res.status(400).send({ message: 'Só cobranças faturadas recebem lembrete.' })

        const diff = billing.due_date ? Math.floor((Date.now() - new Date(billing.due_date as any).getTime()) / 86400000) : 0
        const result = await sendBillingReminder(billing.id, 'manual', diff)

        if (result === 'enviado') return res.send({ message: 'Lembrete enviado' })
        return res.status(400).send({ message: result === 'ignorado' ? 'Cliente sem e-mail cadastrado.' : 'Não foi possível enviar o lembrete.' })
    })
    instance.post('/billing-reminders/run', { preHandler: [isAuthed] }, async (req, res) => res.send(await runBillingReminders({ force: true })))

    instance.post('/billing-receipt', { preHandler: [isAuthed] }, billingReceipt)

    instance.put('/billing-protocols/:id', { preHandler: [isAuthed] }, billingProtocolController.update)

    instance.get('/os-entries', { preHandler: [isAuthed] }, osEntriesController.index as any)
    instance.get('/os-entries/:id', { preHandler: [isAuthed] }, osEntriesController.show as any)
    instance.post('/os-entries', { preHandler: [isAuthed] }, osEntriesController.create as any)
    instance.put('/os-entries/:id', { preHandler: [isAuthed] }, osEntriesController.update as any)
    instance.delete('/os-entries/:id', { preHandler: [isAuthed] }, osEntriesController.destroy as any)

    instance.get('/utils/currentOs', { preHandler: [isAuthed] }, currentOs)

    instance.get('/sla-levels', { preHandler: [isAuthed] }, slaController.index)
    instance.post('/sla-levels', { preHandler: [isAuthed] }, slaController.store)
    instance.put('/sla-levels/:id', { preHandler: [isAuthed] }, slaController.update)
    instance.delete('/sla-levels/:id', { preHandler: [isAuthed] }, slaController.destroy)

    instance.post('/reimbursements', { preHandler: [isAuthed] }, reimbursementsController.store)
    instance.get('/reimbursements/:id', { preHandler: [isAuthed] }, reimbursementsController.show as any)
    instance.post('/reimbursements/:id/upload', { preHandler: [isAuthed] }, reimbursementsController.upload as any)
    instance.delete('/reimbursements/:id', { preHandler: [isAuthed] }, reimbursementsController.destroy as any)

    next()
}

export default routes
