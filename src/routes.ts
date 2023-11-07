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

const routes: FastifyPluginCallback = (instance, opts, next) => {
    instance.get('/', helloController.handler)

    instance.post('/auth', authController.auth)
    instance.post('/auth/refresh', authController.auth)
    instance.get('/auth/verify', { preHandler: [isAuthed] }, authController.verify)

    instance.get('/clients', { preHandler: [isAuthed] }, clientController.index)
    instance.get('/clients/:id', { preHandler: [isAuthed] }, clientController.show)
    instance.post('/clients', { preHandler: [isAuthed] }, clientController.store)
    instance.put('/clients/:id', { preHandler: [isAuthed] }, clientController.update)

    instance.get('/contacts', { preHandler: [isAuthed] }, contactsController.index)
    instance.get('/contacts/:id', { preHandler: [isAuthed] }, contactsController.show)
    instance.post('/contacts', { preHandler: [isAuthed] }, contactsController.store)
    instance.put('/contacts/:id', { preHandler: [isAuthed] }, contactsController.update)

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

    instance.get('/protocols', { preHandler: [isAuthed] }, protocolsController.index)
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
    instance.put('/subscriptions/:id', { preHandler: [isAuthed] }, subscriptionController.update)

    instance.get('/utils/currentOs', { preHandler: [isAuthed] }, currentOs)

    next()
}

export default routes
