import crypto from 'crypto'

// Links assinados e com validade para downloads que o navegador abre por navegação direta (sem header Authorization),
// como os PDFs. A assinatura cobre o recurso (escopo) e a expiração, então o link não serve para outro documento.
const DEFAULT_TTL_SECONDS = 15 * 60

function secret(): string {
    const value = process.env.SECRET
    if (!value) throw new Error('SECRET não configurada')
    return value
}

function mac(scope: string, exp: number): Buffer {
    return crypto.createHmac('sha256', secret()).update(`pdf|${scope}|${exp}`).digest()
}

export function signScope(scope: string, ttlSeconds = DEFAULT_TTL_SECONDS): { exp: number; sig: string } {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds
    return { exp, sig: mac(scope, exp).toString('base64url') }
}

export function verifyScope(scope: string, exp: unknown, sig: unknown): boolean {
    const expiresAt = Number(exp)
    if (!Number.isFinite(expiresAt) || typeof sig !== 'string' || !sig) return false
    if (expiresAt < Math.floor(Date.now() / 1000)) return false

    const given = Buffer.from(sig, 'base64url')
    const expected = mac(scope, expiresAt)

    return given.length === expected.length && crypto.timingSafeEqual(given, expected)
}
