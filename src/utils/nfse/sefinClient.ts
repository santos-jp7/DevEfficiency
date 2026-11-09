// Cliente HTTP da Sefin Nacional (API do Emissor Público Nacional da NFS-e).
// Autenticação por mTLS com o certificado A1 do prestador; o JSON é só o envelope: a DPS vai assinada,
// compactada em GZip e codificada em Base64 (dpsXmlGZipB64), e a NFS-e volta do mesmo jeito (nfseXmlGZipB64).
import https from 'https'
import { gunzipSync, gzipSync } from 'zlib'
import { Ambiente } from './dps'

export const SEFIN_BASE_URL: Record<Ambiente, string> = {
    producao: 'https://sefin.nfse.gov.br/SefinNacional',
    producao_restrita: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional',
}

export interface SefinRequest {
    method: 'GET' | 'POST' | 'HEAD'
    url: string
    body?: unknown
    pfx: Buffer
    passphrase: string
}

export interface SefinResponse {
    status: number
    body: any // JSON já interpretado (ou texto, se não for JSON)
}

export type SefinTransport = (req: SefinRequest) => Promise<SefinResponse>

export class SefinNetworkError extends Error {}

const TIMEOUT_MS = 60_000

const httpsTransport: SefinTransport = (req) =>
    new Promise((resolve, reject) => {
        const payload = req.body === undefined ? undefined : JSON.stringify(req.body)
        const r = https.request(
            req.url,
            {
                method: req.method,
                agent: new https.Agent({ pfx: req.pfx, passphrase: req.passphrase, keepAlive: false }),
                headers: {
                    Accept: 'application/json',
                    ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
                },
                timeout: TIMEOUT_MS,
            },
            (res) => {
                const chunks: Buffer[] = []
                res.on('data', (c) => chunks.push(c))
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8')
                    let body: any = text
                    try {
                        body = text ? JSON.parse(text) : null
                    } catch {
                        /* corpo não-JSON (ex.: HTML de erro do servidor) */
                    }
                    resolve({ status: res.statusCode || 0, body })
                })
            },
        )
        r.on('timeout', () => r.destroy(new SefinNetworkError('Tempo esgotado aguardando a Sefin Nacional.')))
        r.on('error', (err) => reject(err instanceof SefinNetworkError ? err : new SefinNetworkError(err.message)))
        if (payload) r.write(payload)
        r.end()
    })

let transport: SefinTransport = httpsTransport

// Testes trocam o transporte para simular a Sefin; null volta ao HTTPS real.
export function setSefinTransport(t: SefinTransport | null) {
    transport = t || httpsTransport
}

export function gzipB64(text: string): string {
    return gzipSync(Buffer.from(text, 'utf8')).toString('base64')
}

export function gunzipB64(b64: string): string {
    return gunzipSync(Buffer.from(b64, 'base64'), { maxOutputLength: 20 * 1024 * 1024 }).toString('utf8')
}

export interface SefinMessage {
    codigo: string
    descricao: string
    complemento?: string
}

// A Sefin devolve mensagens ora com chaves minúsculas, ora capitalizadas (Codigo/Descricao/Complemento).
export function normalizeMessages(list: any): SefinMessage[] {
    const arr = Array.isArray(list) ? list : list ? [list] : []
    return arr
        .map((m: any) => ({
            codigo: String(m?.codigo ?? m?.Codigo ?? ''),
            descricao: String(m?.descricao ?? m?.Descricao ?? m?.mensagem ?? m?.Mensagem ?? ''),
            ...(m?.complemento || m?.Complemento ? { complemento: String(m.complemento ?? m.Complemento) } : {}),
        }))
        .filter((m: SefinMessage) => m.codigo || m.descricao)
}

export function createSefinClient(ambiente: Ambiente, pfx: Buffer, passphrase: string) {
    const base = SEFIN_BASE_URL[ambiente]
    const send = (method: SefinRequest['method'], path: string, body?: unknown) =>
        transport({ method, url: `${base}${path}`, body, pfx, passphrase })

    return {
        // POST /nfse — gera a NFS-e de forma síncrona a partir da DPS assinada.
        emitir: (signedDpsXml: string) => send('POST', '/nfse', { dpsXmlGZipB64: gzipB64(signedDpsXml) }),
        // GET /nfse/{chave} — XML da NFS-e.
        consultarNfse: (chave: string) => send('GET', `/nfse/${encodeURIComponent(chave)}`),
        // GET /dps/{id} — chave de acesso da NFS-e gerada a partir de uma DPS (404 = não gerada).
        consultarDps: (idDps: string) => send('GET', `/dps/${encodeURIComponent(idDps)}`),
    }
}
