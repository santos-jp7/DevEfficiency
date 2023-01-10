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

import isAuthed from './middlewares/isAuthed'

const routes: FastifyPluginCallback = (instance, opts, next) => {
    instance.get('/', helloController.handler)

    instance.post('/auth', authController.auth)
    instance.post('/auth/refresh', authController.auth)
    instance.get('/auth/verify', { preHandler: [isAuthed] }, authController.verify)

    instance.get('/clients', { preHandler: [isAuthed] }, clientController.index)
    instance.get('/clients/:id', { preHandler: [isAuthed] }, clientController.show)
    instance.post('/clients', { preHandler: [isAuthed] }, clientController.store)
    instance.put('/clients/:id', { preHandler: [isAuthed] }, clientController.update)

    instance.get('/credentials', { preHandler: [isAuthed] }, credentialsController.index)
    instance.get('/credentials/:id', { preHandler: [isAuthed] }, credentialsController.show)
    instance.post('/credentials', { preHandler: [isAuthed] }, credentialsController.store)
    instance.put('/credentials/:id', { preHandler: [isAuthed] }, credentialsController.update)
    instance.delete('/credentials/:id', { preHandler: [isAuthed] }, credentialsController.destroy)

    instance.get('/projects', { preHandler: [isAuthed] }, projectsController.index)
    instance.get('/projects/:id', { preHandler: [isAuthed] }, projectsController.show)
    instance.post('/projects', { preHandler: [isAuthed] }, projectsController.store)
    instance.put('/projects/:id', { preHandler: [isAuthed] }, projectsController.update)

    instance.get('/subprojects', { preHandler: [isAuthed] }, subprojectsController.index)
    instance.get('/subprojects/:id', { preHandler: [isAuthed] }, subprojectsController.show)
    instance.post('/subprojects', { preHandler: [isAuthed] }, subprojectsController.store)
    instance.put('/subprojects/:id', { preHandler: [isAuthed] }, subprojectsController.update)
    instance.delete('/subprojects/:id', { preHandler: [isAuthed] }, subprojectsController.destroy)

    instance.get('/os', { preHandler: [isAuthed] }, serviceOrdersController.index)
    instance.get('/os/:id', { preHandler: [isAuthed] }, serviceOrdersController.show)
    instance.post('/os', { preHandler: [isAuthed] }, serviceOrdersController.store)
    instance.put('/os/:id', { preHandler: [isAuthed] }, serviceOrdersController.update)
    instance.delete('/os/:id', { preHandler: [isAuthed] }, serviceOrdersController.destroy)

    instance.get('/protocols', { preHandler: [isAuthed] }, protocolsController.index)
    instance.get('/protocols/:id', { preHandler: [isAuthed] }, protocolsController.show)
    instance.put('/protocols/:id', { preHandler: [isAuthed] }, protocolsController.update)
    instance.delete('/protocols/:id', { preHandler: [isAuthed] }, protocolsController.destroy)

    instance.get('/protocols/registers', { preHandler: [isAuthed] }, protocolsRegisterController.index)
    instance.get('/protocols/registers/:id', { preHandler: [isAuthed] }, protocolsRegisterController.show)
    instance.post('/protocols/registers', { preHandler: [isAuthed] }, protocolsRegisterController.store)
    instance.put('/protocols/registers/:id', { preHandler: [isAuthed] }, protocolsRegisterController.update)
    instance.delete('/protocols/registers/:id', { preHandler: [isAuthed] }, protocolsRegisterController.destroy)

    instance.get('/protocols/receipts', { preHandler: [isAuthed] }, receiptsController.index)
    instance.get('/protocols/receipts/:id', { preHandler: [isAuthed] }, receiptsController.show)
    instance.post('/protocols/receipts', { preHandler: [isAuthed] }, receiptsController.store)
    instance.put('/protocols/receipts/:id', { preHandler: [isAuthed] }, receiptsController.update)
    instance.delete('/protocols/receipts/:id', { preHandler: [isAuthed] }, receiptsController.destroy)

    next()
}

export default routes
