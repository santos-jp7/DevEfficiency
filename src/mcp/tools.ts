import { FastifyInstance } from 'fastify'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

import callApi, { ApiResult, HttpMethod } from './callApi'
import { Action, resources, describeFields } from './resources'

const queryShape = z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe('Filtros enviados como query string')

const dataShape = z.record(z.string(), z.any()).optional().describe('Corpo JSON para create/update')

function disabledTools(): string[] {
    return (process.env.MCP_DISABLE || '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
}

function toResult(result: ApiResult, filename = 'documento.pdf'): CallToolResult {
    if (result.buffer && result.ok) {
        return {
            content: [
                {
                    type: 'resource',
                    resource: {
                        uri: `devefficiency://pdf/${filename}`,
                        mimeType: 'application/pdf',
                        blob: result.buffer.toString('base64'),
                    },
                },
            ],
        }
    }

    const body = result.json !== undefined ? JSON.stringify(result.json) : result.text || ''

    return {
        isError: !result.ok,
        content: [{ type: 'text', text: result.ok ? body : `HTTP ${result.status}: ${body}` }],
    }
}

function errorResult(message: string): CallToolResult {
    return { isError: true, content: [{ type: 'text', text: message }] }
}

const ACTION_METHOD: Record<Action, HttpMethod> = {
    list: 'GET',
    get: 'GET',
    create: 'POST',
    update: 'PUT',
    delete: 'DELETE',
}

export default function registerTools(server: McpServer, app: FastifyInstance): void {
    const disabled = disabledTools()

    const register: McpServer['registerTool'] = ((name: string, config: any, cb: any) => {
        if (disabled.includes(name)) return undefined

        // Toda tool declara inputSchema, então o SDK sempre chama (args, extra)
        return (server.registerTool as any)(name, config, async (args: any, extra: any) => {
            console.log(`[mcp] ${name} ${JSON.stringify(args)}`)

            try {
                return await cb(args, extra)
            } catch (err: any) {
                return errorResult(err?.message || 'Erro ao executar a ferramenta')
            }
        })
    }) as any

    for (const resource of resources) {
        const actions = resource.actions as [Action, ...Action[]]
        const hasDelete = actions.includes('delete')

        register(
            resource.name,
            {
                title: resource.description,
                description: [
                    `${resource.description}. Ações: ${actions.join(', ')}.`,
                    'get/update/delete exigem id; create/update recebem data.',
                    `Campos (* = obrigatório): ${describeFields(resource.model)}.`,
                    resource.queryHelp ? `Filtros de list (query): ${resource.queryHelp}.` : '',
                ]
                    .filter(Boolean)
                    .join(' '),
                inputSchema: {
                    action: z.enum(actions),
                    id: z.number().int().optional().describe('ID do registro'),
                    query: queryShape,
                    data: dataShape,
                },
                annotations: { destructiveHint: hasDelete, openWorldHint: false },
            },
            async ({ action, id, query, data }: { action: Action; id?: number; query?: any; data?: any }) => {
                const needsId = action === 'get' || action === 'update' || action === 'delete'

                if (needsId && id === undefined) return errorResult(`A ação "${action}" exige o parâmetro id.`)

                const path = needsId ? `${resource.path}/${id}` : resource.path
                const body = action === 'create' || action === 'update' ? data || {} : undefined

                return toResult(await callApi(app, ACTION_METHOD[action], path, { query, body }))
            },
        )
    }

    register(
        'client_sla_configs',
        {
            title: 'SLA por cliente',
            description:
                'Configurações de SLA de um cliente. list: client_id. create (cria ou atualiza pela gravidade): client_id + data { gravidade, response_hours, solution_hours }. delete: client_id + config_id.',
            inputSchema: {
                action: z.enum(['list', 'create', 'delete']),
                client_id: z.number().int(),
                config_id: z.number().int().optional(),
                data: dataShape,
            },
            annotations: { destructiveHint: true, openWorldHint: false },
        },
        async ({ action, client_id, config_id, data }: any) => {
            const base = `/clients/${client_id}/sla-configs`

            if (action === 'list') return toResult(await callApi(app, 'GET', base))
            if (action === 'create') return toResult(await callApi(app, 'POST', base, { body: data || {} }))
            if (config_id === undefined) return errorResult('A ação "delete" exige config_id.')

            return toResult(await callApi(app, 'DELETE', `${base}/${config_id}`))
        },
    )

    register(
        'config',
        {
            title: 'Configurações do sistema',
            description:
                'Configurações gerais (ex.: default_day_due, dados da empresa). list: todas. get: type. set: type + value.',
            inputSchema: {
                action: z.enum(['list', 'get', 'set']),
                type: z.string().optional(),
                value: z.string().optional(),
            },
            annotations: { destructiveHint: false, openWorldHint: false },
        },
        async ({ action, type, value }: any) => {
            if (action === 'list') return toResult(await callApi(app, 'GET', '/config'))
            if (!type) return errorResult(`A ação "${action}" exige type.`)
            if (action === 'get') return toResult(await callApi(app, 'GET', `/config/${encodeURIComponent(type)}`))

            return toResult(await callApi(app, 'POST', `/config/${encodeURIComponent(type)}`, { body: { value } }))
        },
    )

    const reports: [string, string, string, Record<string, z.ZodTypeAny>][] = [
        [
            'financial_history',
            '/financial-history',
            'Fluxo de caixa (histórico financeiro) no período.',
            { startDate: z.string().optional(), endDate: z.string().optional() },
        ],
        [
            'dre_report',
            '/dre-report',
            'DRE (Demonstração do Resultado) do mês.',
            { month: z.string().optional(), year: z.string().optional() },
        ],
        [
            'expense_report',
            '/expense-report',
            'Relatório de despesas no período.',
            { startDate: z.string().optional(), endDate: z.string().optional() },
        ],
        [
            'financial_comparison',
            '/financial-comparison',
            'Comparativo financeiro (receitas x despesas) no período.',
            { startDate: z.string().optional(), endDate: z.string().optional() },
        ],
    ]

    for (const [name, path, description, shape] of reports) {
        register(
            name,
            {
                title: description,
                description: `${description} Datas no formato YYYY-MM-DD.`,
                inputSchema: shape,
                annotations: { readOnlyHint: true, openWorldHint: false },
            },
            async (args: any) => toResult(await callApi(app, 'GET', path, { query: args })),
        )
    }

    register(
        'current_os',
        {
            title: 'OS atual',
            description: 'Retorna a ordem de serviço em andamento.',
            inputSchema: {},
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => toResult(await callApi(app, 'GET', '/utils/currentOs')),
    )

    register(
        'billing_send_email',
        {
            title: 'Enviar cobrança por e-mail',
            description: 'Envia a cobrança por e-mail para o cliente. Ação externa e irreversível.',
            inputSchema: { id: z.number().int().describe('ID da cobrança') },
            annotations: { destructiveHint: true, openWorldHint: true },
        },
        async ({ id }: any) => toResult(await callApi(app, 'POST', `/billings/${id}/send-email`)),
    )

    register(
        'billing_receipt',
        {
            title: 'Dar baixa em cobrança',
            description: 'Registra o pagamento de uma cobrança, gerando os recebimentos dos protocolos.',
            inputSchema: {
                id: z.number().int().describe('ID da cobrança'),
                method: z.enum(['Pix', 'Boleto', 'Cartão', 'Transferência', 'Espécie']),
                BankAccountId: z.number().int(),
            },
            annotations: { destructiveHint: true, openWorldHint: false },
        },
        async (args: any) => toResult(await callApi(app, 'POST', '/billing-receipt', { body: args })),
    )

    register(
        'service_order_pdf',
        {
            title: 'PDF da OS',
            description: 'Gera o PDF de orçamento/fatura/recibo de uma ordem de serviço.',
            inputSchema: { id: z.number().int() },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ id }: any) => toResult(await callApi(app, 'GET', `/os/${id}/pdf`), `os_${id}.pdf`),
    )

    register(
        'service_order_invoice_pdf',
        {
            title: 'Invoice internacional da OS',
            description: 'Gera invoice internacional em PDF de uma OS.',
            inputSchema: {
                id: z.number().int(),
                currency: z.enum(['USD', 'EUR', 'GBP', 'BRL']).optional(),
                BankAccountId: z.number().int().optional(),
            },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ id, ...query }: any) =>
            toResult(await callApi(app, 'GET', `/os/${id}/invoice-pdf`, { query }), `invoice_${id}.pdf`),
    )

    register(
        'billing_pdf',
        {
            title: 'PDF da cobrança',
            description: 'Gera o PDF de uma cobrança.',
            inputSchema: { id: z.number().int() },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ id }: any) => toResult(await callApi(app, 'GET', `/billings/${id}/pdf`), `billing_${id}.pdf`),
    )

    register(
        'protocols_pdf',
        {
            title: 'PDF de protocolos',
            description: 'Gera PDF da lista de protocolos filtrada por tipo e cliente.',
            inputSchema: {
                type: z.string().optional().describe('Padrão: Liberado para pagamento'),
                ClientId: z.number().int().optional(),
            },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async (query: any) => toResult(await callApi(app, 'GET', '/protocols/pdf', { query }), 'protocols.pdf'),
    )
}
