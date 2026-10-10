import crypto from 'crypto'
import jsonwebtoken from 'jsonwebtoken'
import { FastifyReply, FastifyRequest } from 'fastify'

type AccessClaims = jsonwebtoken.JwtPayload & { email?: string; common_name?: string }

const CERTS_TTL = 60 * 60 * 1000

let certsCache: { keys: Map<string, crypto.KeyObject>; fetchedAt: number } | null = null

function accessConfig() {
    const team = (process.env.CF_ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '')
    const aud = process.env.CF_ACCESS_AUD || ''

    return team && aud ? { team, aud } : null
}

async function loadCerts(team: string): Promise<Map<string, crypto.KeyObject>> {
    const response = await fetch(`https://${team}/cdn-cgi/access/certs`)

    if (!response.ok) throw new Error(`Falha ao buscar certificados do Cloudflare Access: HTTP ${response.status}`)

    const { keys } = (await response.json()) as { keys: (crypto.JsonWebKey & { kid: string })[] }
    const map = new Map<string, crypto.KeyObject>()

    for (const jwk of keys) map.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }))

    certsCache = { keys: map, fetchedAt: Date.now() }

    return map
}

async function publicKeyFor(team: string, kid: string): Promise<crypto.KeyObject | undefined> {
    const fresh = certsCache && Date.now() - certsCache.fetchedAt < CERTS_TTL
    const keys = fresh ? certsCache!.keys : await loadCerts(team)

    // kid desconhecido: o Cloudflare pode ter rotacionado as chaves
    if (!keys.has(kid) && fresh) return (await loadCerts(team)).get(kid)

    return keys.get(kid)
}

// Valida o JWT que o Cloudflare Access injeta nas requisições que ele liberou
async function verifyAccessJwt(token: string): Promise<boolean> {
    const config = accessConfig()

    if (!config) return false

    const decoded = jsonwebtoken.decode(token, { complete: true })
    const kid = decoded?.header.kid

    if (!kid) return false

    const key = await publicKeyFor(config.team, kid)

    if (!key) return false

    let claims: AccessClaims

    try {
        claims = jsonwebtoken.verify(token, key.export({ type: 'spki', format: 'pem' }) as string, {
            algorithms: ['RS256'],
            audience: config.aud,
            issuer: `https://${config.team}`,
        }) as AccessClaims
    } catch {
        return false
    }

    const allowed = (process.env.CF_ACCESS_ALLOWED_EMAILS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)

    // Service Tokens não têm e-mail; já são restringidos pela política do Access
    if (!claims.email) return Boolean(claims.common_name)
    if (allowed.length && !allowed.includes(claims.email.toLowerCase())) return false

    return true
}

function validApiKey(authorization: string | undefined): boolean {
    const apiKey = process.env.MCP_API_KEY
    const token = (authorization || '').replace(/^bearer /i, '')

    if (!apiKey || !token) return false

    const expected = crypto.createHash('sha256').update(apiKey).digest()
    const received = crypto.createHash('sha256').update(token).digest()

    return crypto.timingSafeEqual(expected, received)
}

export default async function isMcpAuthed(req: FastifyRequest, res: FastifyReply): Promise<void> {
    // MCP fica desligado enquanto nem MCP_API_KEY nem o Cloudflare Access estiverem configurados
    if (!process.env.MCP_API_KEY && !accessConfig()) {
        return res.status(404).send({ error: true, message: 'Not Found' })
    }

    const accessJwt = req.headers['cf-access-jwt-assertion']

    if (typeof accessJwt === 'string' && accessJwt) {
        try {
            if (await verifyAccessJwt(accessJwt)) return
        } catch (err: any) {
            req.log.error(err)
        }
    }

    if (validApiKey(req.headers.authorization)) return

    return res.status(401).send({ error: true, message: 'Não autorizado.' })
}
