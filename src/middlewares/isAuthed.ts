import jsonwebtoken from 'jsonwebtoken'

import {
    FastifyReply,
    FastifyRequest,
    HookHandlerDoneFunction,
    RequestBodyDefault,
    RequestHeadersDefault,
} from 'fastify'
import User from '../models/User'

type isAuthedRequest = FastifyRequest<{
    Body: RequestBodyDefault
    Headers: RequestHeadersDefault
}>

export function decodeToken(authorization?: string): User | null {
    try {
        return jsonwebtoken.verify(
            authorization?.replace('bearer ', '').replace('Bearer ', '') as string,
            process.env.SECRET as string,
        ) as User
    } catch {
        return null
    }
}

export default function isAuthed(req: isAuthedRequest, res: FastifyReply, next: HookHandlerDoneFunction): void {
    const decoded = decodeToken(req.headers.authorization)

    // Token ausente, inválido ou expirado: 401 (antes estourava como erro 500).
    if (!decoded) {
        res.status(401).send({ error: true, message: 'Não autorizado.' })
        return
    }

    req.__user = decoded

    next()
}
