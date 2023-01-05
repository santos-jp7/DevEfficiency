import fastify, { FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import path from 'path'

import routes from './routes'

const app: FastifyInstance = fastify()

declare module 'fastify' {
    export interface FastifyRequest {
        __user: any
    }
}

app.addHook('preHandler', (req, reply, done) => {
    req.__user = {}

    done()
})

app.register(helmet, {
    contentSecurityPolicy: false,
})
app.register(routes, { prefix: 'api' })

app.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
})

export default app
