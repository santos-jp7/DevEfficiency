import { FastifyReply, FastifyRequest } from 'fastify'

import { decodeToken } from './isAuthed'
import { verifyScope } from '../utils/signedLinks'

type Q = Record<string, string | undefined>

// Escopo assinado de cada PDF: amarra o link ao documento (e, no consolidado, ao cliente e à situação).
export const pdfScopes = {
    billing: (id: string) => `billing:${id}`,
    os: (id: string) => `os:${id}`,
    osInvoice: (id: string) => `os-invoice:${id}`,
    protocols: (ClientId: string, type: string) => `protocols:${ClientId}:${type}`,
}

// PDFs aceitam: (1) Bearer válido — uso da API/MCP; ou (2) link assinado e não expirado — navegação direta do navegador.
export function pdfAccess(scopeOf: (req: FastifyRequest) => string) {
    return async function (req: FastifyRequest, res: FastifyReply) {
        if (req.headers.authorization) {
            const user = decodeToken(req.headers.authorization)
            if (user) {
                req.__user = user
                return
            }
            return res.status(401).send({ error: true, message: 'Não autorizado.' })
        }

        const query = (req.query || {}) as Q

        if (verifyScope(scopeOf(req), query.exp, query.sig)) return

        return res.status(401).send({ error: true, message: 'Link inválido ou expirado. Gere o documento novamente.' })
    }
}
