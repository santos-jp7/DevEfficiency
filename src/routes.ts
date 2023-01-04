import { FastifyPluginCallback } from 'fastify'

import helloController from './controllers/helloController'
import clientController from './controllers/clientController'
import credentialsController from './controllers/credentialsController'
import authController from './controllers/authController'
import projectsController from './controllers/projectsController'
import subprojectsController from './controllers/subprojectsController'
import serviceOrdersController from './controllers/serviceOrdersController'

import isAuthed from './middlewares/isAuthed'

const routes: FastifyPluginCallback = (instance, opts, next) => {
    instance.get('/', helloController.handler)

    instance.post('/auth', authController.auth)
    instance.post('/auth/refresh', authController.auth)

    instance.get('/clients', { preHandler: [isAuthed] }, clientController.index)
    instance.get('/clients/:id', { preHandler: [isAuthed] }, clientController.show)
    instance.post('/clients', { preHandler: [isAuthed] }, clientController.store)
    instance.put('/clients', { preHandler: [isAuthed] }, clientController.update)
    instance.delete('/clients', { preHandler: [isAuthed] }, clientController.destroy)

    instance.get('/credentials', { preHandler: [isAuthed] }, credentialsController.index)
    instance.get('/credentials/:id', { preHandler: [isAuthed] }, credentialsController.show)
    instance.post('/credentials', { preHandler: [isAuthed] }, credentialsController.store)
    instance.put('/credentials', { preHandler: [isAuthed] }, credentialsController.update)
    instance.delete('/credentials', { preHandler: [isAuthed] }, credentialsController.destroy)

    instance.get('/projects', { preHandler: [isAuthed] }, projectsController.index)
    instance.get('/projects/:id', { preHandler: [isAuthed] }, projectsController.show)
    instance.post('/projects', { preHandler: [isAuthed] }, projectsController.store)
    instance.put('/projects', { preHandler: [isAuthed] }, projectsController.update)
    instance.delete('/projects', { preHandler: [isAuthed] }, projectsController.destroy)

    instance.get('/subprojects', { preHandler: [isAuthed] }, subprojectsController.index)
    instance.get('/subprojects/:id', { preHandler: [isAuthed] }, subprojectsController.show)
    instance.post('/subprojects', { preHandler: [isAuthed] }, subprojectsController.store)
    instance.put('/subprojects', { preHandler: [isAuthed] }, subprojectsController.update)
    instance.delete('/subprojects', { preHandler: [isAuthed] }, subprojectsController.destroy)

    instance.get('/os', { preHandler: [isAuthed] }, serviceOrdersController.index)
    instance.get('/os/:id', { preHandler: [isAuthed] }, serviceOrdersController.show)
    instance.post('/os', { preHandler: [isAuthed] }, serviceOrdersController.store)
    instance.put('/os', { preHandler: [isAuthed] }, serviceOrdersController.update)
    instance.delete('/os', { preHandler: [isAuthed] }, serviceOrdersController.destroy)

    next()
}

export default routes
