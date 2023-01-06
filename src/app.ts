import fastify, { FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fileStatic from '@fastify/static'
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

app.register(fileStatic, {
    root: path.join(__dirname, 'public'),
    extensions: ['html'],
})

app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
})
app.register(routes, { prefix: 'api' })

export default app
