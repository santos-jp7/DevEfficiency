import jsonwebtoken from 'jsonwebtoken'

import {
    FastifyReply,
    FastifyRequest,
    HookHandlerDoneFunction,
    RequestBodyDefault,
    RequestParamsDefault,
    RequestHeadersDefault,
} from 'fastify'
import User from '../models/User'

type isAuthedRequest = FastifyRequest<{
    Body: RequestBodyDefault
    Headers: RequestHeadersDefault
}>

export default function isAuthed(req: isAuthedRequest, res: FastifyReply, next: HookHandlerDoneFunction): void {
    const { authorization } = req.headers

    const decoded = jsonwebtoken.verify(
        authorization?.replace('bearer ', '').replace('Bearer ', '') as string,
        process.env.SECRET as string,
    ) as User

    req.__user = decoded

    next()
}
