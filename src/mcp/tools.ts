import { FastifyInstance } from 'fastify'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import crypto from 'crypto'

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


// ---------- Confirmação em duas etapas para ações com NFS-e ----------
// Emitir, cancelar e substituir nunca executam na primeira chamada: a ferramenta devolve um resumo e um código de
// confirmação (válido por 15 min, amarrado à ferramenta, à nota/cobrança e aos MESMOS dados). A ação só acontece
// quando a ferramenta é chamada de novo com esse código — o assistente deve mostrar o resumo e esperar o "sim" do usuário.
const CONFIRM_TTL_MS = 15 * 60 * 1000

function canonical(value: any): any {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object')
        return Object.keys(value)
            .sort()
            .reduce((acc: any, k) => ((acc[k] = canonical(value[k])), acc), {})
    return value
}

function confirmationSignature(tool: string, target: number, payload: unknown, exp: number): string {
    return crypto
        .createHmac('sha256', `mcp-confirm:${process.env.SECRET}`)
        .update(JSON.stringify([tool, target, canonical(payload ?? null), exp]))
        .digest('hex')
        .slice(0, 10)
        .toUpperCase()
}

export function issueConfirmation(tool: string, target: number, payload: unknown, now = Date.now()): string {
    const exp = Math.floor((now + CONFIRM_TTL_MS) / 1000)
    return `${exp.toString(36).toUpperCase()}-${confirmationSignature(tool, target, payload, exp)}`
}

export function checkConfirmation(code: string, tool: string, target: number, payload: unknown, now = Date.now()): string | null {
    const [expPart, sig] = String(code || '').trim().toUpperCase().split('-')
    const exp = parseInt(expPart, 36)
    if (!exp || !sig) return 'Código de confirmação inválido.'
    if (exp * 1000 < now) return 'Código de confirmação expirado: peça a confirmação de novo.'
    const expected = confirmationSignature(tool, target, payload, exp)
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
        return 'Código de confirmação não corresponde a esta ação com estes dados (algo mudou desde o resumo): peça a confirmação de novo.'
    return null
}

const CONFIRM_HELP =
    'CONFIRMAÇÃO OBRIGATÓRIA: a primeira chamada (sem "confirmacao") não executa nada — devolve um resumo e um código. ' +
    'Mostre o resumo ao usuário e só chame de novo, com os MESMOS dados e confirmacao=<código>, depois que ele confirmar explicitamente nesta conversa. Nunca confirme por conta própria.'

const brl = (v: unknown) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function confirmationResult(summary: string[], code: string): CallToolResult {
    return {
        content: [
            {
                type: 'text',
                text: [
                    'AÇÃO NÃO EXECUTADA — aguardando confirmação do usuário.',
                    '',
                    ...summary,
                    '',
                    `Código de confirmação (válido por 15 minutos): ${code}`,
                    'Mostre este resumo ao usuário. Só repita a chamada com confirmacao igual ao código acima se ele confirmar explicitamente.',
                ].join('\n'),
            },
        ],
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

    register(
        'crm_opportunity_stage',
        {
            title: 'CRM: mudar etapa da oportunidade',
            description:
                'Move a oportunidade no funil (Novo, Qualificado, Proposta, Negociação, Ganho, Perdido) gravando histórico. Perdido exige lost_reason (Preço, Concorrente, Sem orçamento, Sem resposta, Timing, Escopo, Outro). Ganho aqui só marca como ganha; para gerar cliente/OS/protocolo use crm_opportunity_win. Oportunidade vinda de OS (SourceServiceOrderId): Ganho move a OS para Na fila e Perdido cancela a OS.',
            inputSchema: {
                opportunity_id: z.number().int(),
                stage: z.enum(['Novo', 'Qualificado', 'Proposta', 'Negociação', 'Ganho', 'Perdido']),
                lost_reason: z.string().optional(),
                lost_details: z.string().optional(),
                probability: z.number().int().min(0).max(100).optional(),
            },
            annotations: { destructiveHint: false, openWorldHint: false },
        },
        async ({ opportunity_id, ...body }: any) =>
            toResult(await callApi(app, 'PATCH', `/crm/opportunities/${opportunity_id}/stage`, { body })),
    )

    register(
        'crm_opportunity_win',
        {
            title: 'CRM: ganhar oportunidade',
            description:
                'Ganha a oportunidade e gera o resultado: cria o cliente (e contato) a partir do lead quando ainda não é cliente e, conforme mode, abre uma OS (mode=os: subject, gravidade, prazo, ProjectId), lança um protocolo avulso liberado para pagamento (mode=protocol: registers [{type Serviço|Despesa, description, estimated_hours|value}], products [{ProductId, value, quantity}], discount_value — gera cobrança ao cliente, ou ao fornecedor se billing_mode=Comissão) ou só marca como ganha (mode=none). Campos de cobrança (billing_mode, CommissionSupplierId, commission_percent, commission_value) vêm da oportunidade se omitidos.',
            inputSchema: {
                opportunity_id: z.number().int(),
                mode: z.enum(['os', 'protocol', 'none']),
                data: dataShape,
            },
            annotations: { destructiveHint: true, openWorldHint: false },
        },
        async ({ opportunity_id, mode, data }: any) =>
            toResult(await callApi(app, 'POST', `/crm/opportunities/${opportunity_id}/win`, { body: { ...(data || {}), mode } })),
    )

    register(
        'crm_opportunity_from_os',
        {
            title: 'CRM: enviar OS para o funil',
            description:
                'Cria uma oportunidade a partir de uma OS em aberto (cliente, assunto, valor do protocolo, vendedor e cobrança). Ganhar essa oportunidade move a OS para "Na fila"; perder cancela a OS e o protocolo (se não houver recebimentos).',
            inputSchema: { service_order_id: z.number().int() },
            annotations: { destructiveHint: false, openWorldHint: false },
        },
        async ({ service_order_id }: any) => toResult(await callApi(app, 'POST', `/crm/opportunities/from-os/${service_order_id}`)),
    )

    register(
        'crm_followups',
        {
            title: 'CRM: follow-ups pendentes',
            description: 'Atividades pendentes do CRM. range: overdue (atrasadas), today (até o fim de hoje, padrão) ou week (próximos 7 dias).',
            inputSchema: { range: z.enum(['overdue', 'today', 'week']).optional() },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ range }: any) => toResult(await callApi(app, 'GET', '/crm/followups', { query: range ? { range } : {} })),
    )

    const reports: [string, string, string, Record<string, z.ZodTypeAny>][] = [
        [
            'crm_report',
            '/crm/reports',
            'Relatório de vendas do CRM: funil atual, ganhas/perdidas no período, conversão, ticket e ciclo médios, por vendedor e por origem, motivos de perda, tempo por etapa e previsão.',
            {
                startDate: z.string().optional(),
                endDate: z.string().optional(),
                SellerId: z.number().int().optional(),
                source: z.string().optional(),
            },
        ],
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

    // NFS-e (Emissor Nacional). Emitir/cancelar/substituir geram documento fiscal real em produção:
    // podem ser desligadas com MCP_DISABLE (ex.: MCP_DISABLE=nfse_emit,nfse_cancel,nfse_substitute).
    register(
        'nfse',
        {
            title: 'NFS-e emitidas',
            description:
                'Notas fiscais de serviço (Emissor Nacional). list: filtros opcionais status (processando|autorizada|rejeitada|cancelada|substituida) e billing_id. get: id. settings: configuração e pendências para emitir. draft: billing_id — valores sugeridos, textos padrão e pendências antes de emitir.',
            inputSchema: {
                action: z.enum(['list', 'get', 'settings', 'draft']),
                id: z.number().int().optional(),
                billing_id: z.number().int().optional(),
                status: z.string().optional(),
            },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ action, id, billing_id, status }: any) => {
            if (action === 'list') return toResult(await callApi(app, 'GET', '/nfse', { query: { status, BillingId: billing_id } }))
            if (action === 'settings') return toResult(await callApi(app, 'GET', '/nfse/settings'))
            if (action === 'draft') {
                if (!billing_id) return errorResult('A ação "draft" exige billing_id.')
                return toResult(await callApi(app, 'GET', `/billings/${billing_id}/nfse/draft`))
            }
            if (!id) return errorResult('A ação "get" exige id.')
            return toResult(await callApi(app, 'GET', `/nfse/${id}`))
        },
    )

    register(
        'nfse_emit',
        {
            title: 'Emitir NFS-e de uma cobrança',
            description:
                CONFIRM_HELP +
                ' Emite a NFS-e de uma cobrança pela Sefin Nacional. Campos omitidos usam os valores sugeridos (nfse action draft). data: valor, descricao, competencia (AAAA-MM-DD), iss_retido, ctribnac, ctribmun, cnbs, info_complementar, texto_padrao_id, exterior { ativo, nome, nif | cNaoNIF, cPais, cEndPost, xCidade, xEstProvReg, logradouro, numero, moeda, valor_moeda } para tomador do exterior.',
            inputSchema: { billing_id: z.number().int(), data: dataShape, confirmacao: z.string().optional().describe('Código devolvido pela primeira chamada, após o usuário confirmar') },
            annotations: { destructiveHint: true, openWorldHint: true },
        },
        async ({ billing_id, data, confirmacao }: any) => {
            const body = data || {}
            if (confirmacao) {
                const err = checkConfirmation(confirmacao, 'nfse_emit', billing_id, body)
                if (err) return errorResult(err)
                return toResult(await callApi(app, 'POST', `/billings/${billing_id}/nfse`, { body }))
            }
            const draft = await callApi(app, 'GET', `/billings/${billing_id}/nfse/draft`)
            if (!draft.ok) return toResult(draft)
            const d = draft.json
            if (d.problems?.length) return errorResult(`Não é possível emitir:\n- ${d.problems.join('\n- ')}`)
            const f = { ...d.defaults, ...body }
            const texto = (d.textos_padrao || []).find((t: any) => t.id === f.texto_padrao_id)
            const ext = f.exterior?.ativo ? f.exterior : null
            return confirmationResult(
                [
                    `Emitir NFS-e da cobrança #${billing_id} — ambiente: ${d.ambiente === 'producao' ? 'PRODUÇÃO (com valor fiscal)' : 'testes (sem valor fiscal)'}`,
                    ext
                        ? `Tomador no exterior: ${ext.nome || d.tomador?.nome} (${ext.cPais}) · NIF ${ext.nif || 'não informado'} · ${ext.moeda} ${ext.valor_moeda}`
                        : `Tomador: ${d.tomador?.nome} · ${d.tomador?.documento}`,
                    `Valor: ${brl(f.valor)} · Competência: ${f.competencia} · ISS retido: ${f.iss_retido ? 'sim' : 'não'}`,
                    `Serviço: ${f.ctribnac}${f.cnbs ? ` · NBS ${f.cnbs}` : ''}`,
                    `Descrição:\n${f.descricao}${texto ? `\n\n${texto.texto}` : ''}`,
                    ...(d.warnings || []).map((w: string) => `Aviso: ${w}`),
                ],
                issueConfirmation('nfse_emit', billing_id, body),
            )
        },
    )

    register(
        'nfse_sync',
        {
            title: 'Verificar NFS-e em processamento',
            description:
                CONFIRM_HELP +
                ' Consulta a Sefin para uma NFS-e "processando" (ou com cancelamento pendente) e atualiza a situação; se a nota não foi gerada, reenvia a mesma DPS.',
            inputSchema: { id: z.number().int(), confirmacao: z.string().optional().describe('Código devolvido pela primeira chamada, após o usuário confirmar') },
            annotations: { destructiveHint: false, openWorldHint: true },
        },
        async ({ id, confirmacao }: any) => {
            if (confirmacao) {
                const err = checkConfirmation(confirmacao, 'nfse_sync', id, null)
                if (err) return errorResult(err)
                return toResult(await callApi(app, 'POST', `/nfse/${id}/sync`))
            }
            const got = await callApi(app, 'GET', `/nfse/${id}`)
            if (!got.ok) return toResult(got)
            const n = got.json
            const pendingCancel = n.status === 'autorizada' && n.cancelamento_solicitado_em
            if (n.status !== 'processando' && !pendingCancel) return errorResult(`A NFS-e #${id} está "${n.status}": nada a verificar.`)
            return confirmationResult(
                [
                    pendingCancel
                        ? `Verificar o cancelamento da NFS-e nº ${n.numero_nfse} na Sefin.`
                        : `Verificar a NFS-e #${id} (DPS ${n.serie}/${n.numero_dps}, ${brl(n.valor_servico)}, ${n.tomador_nome}): consulta a Sefin e, se a nota não tiver sido gerada, REENVIA a mesma DPS.`,
                ],
                issueConfirmation('nfse_sync', id, null),
            )
        },
    )

    register(
        'nfse_cancel',
        {
            title: 'Cancelar NFS-e',
            description:
                CONFIRM_HELP + ' Cancela uma NFS-e autorizada. cMotivo: 1 erro na emissão, 2 serviço não prestado, 9 outros. xMotivo: 15 a 255 caracteres. Irreversível.',
            inputSchema: {
                id: z.number().int(),
                cMotivo: z.enum(['1', '2', '9']),
                xMotivo: z.string(),
                confirmacao: z.string().optional().describe('Código devolvido pela primeira chamada, após o usuário confirmar'),
            },
            annotations: { destructiveHint: true, openWorldHint: true },
        },
        async ({ id, cMotivo, xMotivo, confirmacao }: any) => {
            const body = { cMotivo, xMotivo }
            if (confirmacao) {
                const err = checkConfirmation(confirmacao, 'nfse_cancel', id, body)
                if (err) return errorResult(err)
                return toResult(await callApi(app, 'POST', `/nfse/${id}/cancel`, { body }))
            }
            const got = await callApi(app, 'GET', `/nfse/${id}`)
            if (!got.ok) return toResult(got)
            const n = got.json
            if (n.status !== 'autorizada') return errorResult(`A NFS-e #${id} está "${n.status}": só nota autorizada pode ser cancelada.`)
            return confirmationResult(
                [
                    `CANCELAR DEFINITIVAMENTE a NFS-e nº ${n.numero_nfse} (${n.ambiente === 'producao' ? 'produção' : 'testes'})`,
                    `Tomador: ${n.tomador_nome} · Valor: ${brl(n.valor_servico)} · Cobrança #${n.BillingId}`,
                    `Motivo: ${{ '1': 'Erro na emissão', '2': 'Serviço não prestado', '9': 'Outros' }[cMotivo as '1']} — ${xMotivo}`,
                ],
                issueConfirmation('nfse_cancel', id, body),
            )
        },
    )

    register(
        'nfse_substitute',
        {
            title: 'Substituir NFS-e',
            description:
                CONFIRM_HELP +
                ' Emite uma NFS-e substituta (a original é cancelada pela Sefin). Campos omitidos usam os da nota original. data: os mesmos campos de nfse_emit + cMotivo (01..05, 99) e xMotivo. Optante do Simples não altera valor, competência nem tomador.',
            inputSchema: { id: z.number().int(), data: dataShape, confirmacao: z.string().optional().describe('Código devolvido pela primeira chamada, após o usuário confirmar') },
            annotations: { destructiveHint: true, openWorldHint: true },
        },
        async ({ id, data, confirmacao }: any) => {
            const body = data || {}
            if (confirmacao) {
                const err = checkConfirmation(confirmacao, 'nfse_substitute', id, body)
                if (err) return errorResult(err)
                return toResult(await callApi(app, 'POST', `/nfse/${id}/substitute`, { body }))
            }
            const draft = await callApi(app, 'GET', `/nfse/${id}/substitute/draft`)
            if (!draft.ok) return toResult(draft)
            const d = draft.json
            const f = { ...d.defaults, ...body }
            if (d.bloqueados?.length) Object.assign(f, { valor: d.defaults.valor, competencia: d.defaults.competencia })
            const texto = (d.textos_padrao || []).find((t: any) => t.id === f.texto_padrao_id)
            return confirmationResult(
                [
                    `SUBSTITUIR a NFS-e nº ${d.original.numero_nfse}: uma nova nota é emitida e a original é cancelada (${d.ambiente === 'producao' ? 'produção' : 'testes'})`,
                    `Motivo: ${f.cMotivo} — ${d.motivos?.[f.cMotivo] || ''}${f.xMotivo ? ` (${f.xMotivo})` : ''}`,
                    `Tomador: ${d.tomador?.nome} · Valor: ${brl(f.valor)} · Competência: ${f.competencia}`,
                    `Nova descrição:\n${f.descricao}${texto ? `\n\n${texto.texto}` : ''}`,
                ],
                issueConfirmation('nfse_substitute', id, body),
            )
        },
    )

    register(
        'nfse_pdf',
        {
            title: 'PDF da NFS-e (DANFSe)',
            description: 'Gera o PDF (DANFSe) de uma NFS-e autorizada.',
            inputSchema: { id: z.number().int() },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ id }: any) => toResult(await callApi(app, 'GET', `/nfse/${id}/pdf`), `nfse_${id}.pdf`),
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
