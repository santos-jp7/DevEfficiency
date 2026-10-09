import crypto from 'crypto'
import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify'

export default function isMcpAuthed(req: FastifyRequest, res: FastifyReply, next: HookHandlerDoneFunction): void {
    const apiKey = process.env.MCP_API_KEY

    // MCP fica desligado enquanto MCP_API_KEY não estiver definido
    if (!apiKey) {
        res.status(404).send({ error: true, message: 'Not Found' })
        return
    }

    const token = (req.headers.authorization || '').replace(/^bearer /i, '')

    const expected = crypto.createHash('sha256').update(apiKey).digest()
    const received = crypto.createHash('sha256').update(token).digest()

    if (!token || !crypto.timingSafeEqual(expected, received)) {
        res.status(401).send({ error: true, message: 'Não autorizado.' })
        return
    }

    next()
}
