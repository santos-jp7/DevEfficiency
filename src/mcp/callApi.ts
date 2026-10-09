import jsonwebtoken from 'jsonwebtoken'
import { FastifyInstance } from 'fastify'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type ApiResult = {
    ok: boolean
    status: number
    contentType: string
    json?: any
    text?: string
    buffer?: Buffer
}

function serviceToken(): string {
    return jsonwebtoken.sign({ user: { id: 0, username: 'mcp' } }, String(process.env.SECRET), { expiresIn: '5m' })
}

function toQueryString(query?: Record<string, unknown>): string {
    if (!query) return ''

    const params = new URLSearchParams()

    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') continue
        params.append(key, String(value))
    }

    const qs = params.toString()

    return qs ? `?${qs}` : ''
}

// Executa uma rota da API REST internamente (sem rede), reaproveitando controllers e hooks
export default async function callApi(
    app: FastifyInstance,
    method: HttpMethod,
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown } = {},
): Promise<ApiResult> {
    const response = await app.inject({
        method,
        url: `/api${path}${toQueryString(options.query)}`,
        headers: { authorization: `Bearer ${serviceToken()}` },
        payload: options.body === undefined ? undefined : (options.body as any),
    })

    const contentType = String(response.headers['content-type'] || '')
    const result: ApiResult = {
        ok: response.statusCode < 400,
        status: response.statusCode,
        contentType,
    }

    if (contentType.includes('application/json')) {
        try {
            result.json = response.json()
        } catch {
            result.text = response.body
        }
    } else if (contentType.includes('application/pdf')) {
        result.buffer = response.rawPayload
    } else {
        result.text = response.body
    }

    return result
}
