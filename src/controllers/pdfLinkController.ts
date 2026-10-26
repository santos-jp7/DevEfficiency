import { FastifyRequest, FastifyReply } from 'fastify'

import { pdfScopes } from '../middlewares/pdfAccess'
import { signScope } from '../utils/signedLinks'

type Q = Record<string, string | undefined>

const numeric = (v?: string) => (v && /^\d+$/.test(v) ? v : null)

// Gera (autenticado) um link temporário para baixar um PDF. O navegador abre o link sem Authorization.
class pdfLinkController {
    static async create(req: FastifyRequest, res: FastifyReply) {
        const q = (req.query || {}) as Q
        const id = numeric(q.id)

        let path: string
        let scope: string
        const extra = new URLSearchParams()

        switch (q.kind) {
            case 'billing':
                if (!id) return res.status(400).send({ message: 'id inválido' })
                path = `/api/billings/${id}/pdf`
                scope = pdfScopes.billing(id)
                break
            case 'os':
                if (!id) return res.status(400).send({ message: 'id inválido' })
                path = `/api/os/${id}/pdf`
                scope = pdfScopes.os(id)
                break
            case 'os-invoice':
                if (!id) return res.status(400).send({ message: 'id inválido' })
                path = `/api/os/${id}/invoice-pdf`
                scope = pdfScopes.osInvoice(id)
                // Opções de apresentação: não alteram o escopo assinado.
                if (q.currency) extra.set('currency', q.currency)
                if (numeric(q.BankAccountId)) extra.set('BankAccountId', q.BankAccountId as string)
                break
            case 'protocols': {
                const clientId = numeric(q.ClientId)
                if (!clientId || !q.type) return res.status(400).send({ message: 'ClientId e type são obrigatórios' })
                path = '/api/protocols/pdf'
                scope = pdfScopes.protocols(clientId, q.type)
                extra.set('ClientId', clientId)
                extra.set('type', q.type)
                break
            }
            default:
                return res.status(400).send({ message: 'Tipo de documento inválido' })
        }

        const { exp, sig } = signScope(scope)
        extra.set('exp', String(exp))
        extra.set('sig', sig)

        return res.send({ url: `${path}?${extra.toString()}`, expires_in: exp - Math.floor(Date.now() / 1000) })
    }
}

export default pdfLinkController
