// Emissão de NFS-e (Emissor Nacional) a partir de uma cobrança.
// Fluxo: rascunho (valores sugeridos + pendências) → reserva do nº da DPS → monta e assina o XML → POST /nfse
// → autorizada (guarda XML, gera o DANFSe, anexa à cobrança e marca como faturada) ou rejeitada (guarda os erros).
// Sem resposta conclusiva (timeout/queda), a nota fica "processando" e "Verificar" consulta a Sefin pelo Id da DPS
// antes de reenviar a MESMA DPS — nunca se gera uma segunda nota para a mesma cobrança.
import db from '../../db'
import Billing from '../../models/Billing'
import BillingFile from '../../models/BillingFile'
import BillingProtocol from '../../models/BillingProtocol'
import Client from '../../models/Client'
import Address from '../../models/Address'
import Supplier from '../../models/Supplier'
import Protocol from '../../models/Protocol'
import Protocol_register from '../../models/Protocol_register'
import Protocol_product from '../../models/Protocol_product'
import Product from '../../models/Product'
import Nfse from '../../models/Nfse'
import CloudFlareR2 from '../../providers/CloudFlareR2'
import { buildDpsId, buildDpsXml, DpsExterior, DpsInput, DpsPessoa, isValidCnpj, isValidCpf, onlyDigits, todayBR } from './dps'
import { signDps } from './sign'
import { buildCancelamentoXml, EVENTO_CANCELAMENTO, MOTIVOS_CANCELAMENTO, signPedRegEvento } from './events'
import { createSefinClient, gunzipB64, normalizeMessages, SefinMessage, SefinResponse } from './sefinClient'
import { parseNfseXml } from './parseNfse'
import { danfsePdf } from './danfse'
import { getCertificateInfo, getNfseSettings, ibscbsFromSettings, loadCertificate, nextDpsNumber, NfseSettings, settingsProblems } from './settings'

export class NfseError extends Error {
    constructor(message: string, public status = 400, public details?: unknown) {
        super(message)
    }
}

const ACTIVE: string[] = ['processando', 'autorizada']

async function loadBilling(id: number) {
    return Billing.findByPk(id, {
        include: [
            { model: Client, include: [Address] },
            Supplier,
            {
                model: BillingProtocol,
                include: [{ model: Protocol, include: [Protocol_register, { model: Protocol_product, include: [Product] }] }],
            },
        ],
    })
}

// Tomador: o cliente da cobrança — ou o fornecedor, nas cobranças de comissão.
// `docInvalido`: sem CPF/CNPJ válido a nota só sai como tomador do exterior (exportação).
function resolveTomador(billing: any): { tomador: DpsPessoa | null; problems: string[]; warnings: string[]; docInvalido?: string } {
    const problems: string[] = []
    const warnings: string[] = []

    if (billing.Supplier) {
        const s = billing.Supplier
        const doc = onlyDigits(s.cnpj)
        if (!isValidCnpj(doc) && !isValidCpf(doc)) problems.push(`O fornecedor ${s.name} não tem CNPJ/CPF válido no cadastro.`)
        warnings.push('Fornecedor sem endereço no cadastro: a nota sai sem o endereço do tomador.')
        return { tomador: { documento: doc, nome: s.name, email: s.email || null, endereco: null }, problems, warnings }
    }

    const c = billing.Client
    if (!c) return { tomador: null, problems: ['Cobrança sem cliente.'], warnings }
    const doc = onlyDigits(c.document)
    const docInvalido =
        !isValidCnpj(doc) && !isValidCpf(doc)
            ? `O cliente ${c.name} não tem CPF/CNPJ válido no cadastro: corrija o cadastro ou emita como tomador do exterior.`
            : undefined

    const addresses: any[] = c.Addresses || []
    const a = addresses.find((x) => x.type === 'Cobrança') || addresses[0]
    let endereco: DpsPessoa['endereco'] = null
    if (!a) warnings.push('Cliente sem endereço cadastrado: a nota sai sem o endereço do tomador.')
    else {
        const missing = [
            !/^\d{7}$/.test(onlyDigits(a.ibge)) && 'código IBGE',
            !/^\d{8}$/.test(onlyDigits(a.zip)) && 'CEP',
            !String(a.street_name || '').trim() && 'logradouro',
            !String(a.neighborhood || '').trim() && 'bairro',
        ].filter(Boolean)
        if (missing.length) warnings.push(`Endereço do cliente incompleto (${missing.join(', ')}): a nota sai sem o endereço do tomador.`)
        else
            endereco = {
                cMun: onlyDigits(a.ibge),
                cep: onlyDigits(a.zip),
                logradouro: String(a.street_name).trim().slice(0, 255),
                numero: a.number ? String(a.number) : 'S/N',
                complemento: a.complement ? String(a.complement).trim().slice(0, 156) : null,
                bairro: String(a.neighborhood).trim().slice(0, 60),
            }
    }
    const email = String(c.email || '').trim()
    return {
        tomador: {
            documento: doc,
            nome: String(c.corporate_name || c.name).trim().slice(0, 300),
            email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 80 ? email : null,
            endereco,
        },
        problems,
        warnings,
        docInvalido,
    }
}

const brl = (v: unknown) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Descrição a partir da cobrança: registros (serviços e despesas) e produtos dos protocolos. Os valores de cada item
// só aparecem quando somam o valor da cobrança (numa parcela, os itens não batem com o valor da nota).
function defaultDescription(billing: any, settings: NfseSettings): string {
    const items: { text: string; value: number }[] = []
    for (const bp of billing.BillingProtocols || []) {
        const p = bp.Protocol
        if (!p) continue
        for (const r of p.Protocol_registers || []) {
            if (!r.description) continue
            items.push({ text: r.type === 'Despesa' ? `${r.description} (reembolso de despesa)` : r.description, value: Number(r.value) || 0 })
        }
        for (const pp of p.Protocol_products || [])
            if (pp.Product?.description) items.push({ text: pp.Product.description, value: Number(pp.value) || 0 })
    }
    const sum = Math.round(items.reduce((a, i) => a + i.value, 0) * 100) / 100
    const withValues = items.length > 0 && Math.abs(sum - Number(billing.total_value || 0)) < 0.01
    const lines = items.map((i) => `- ${String(i.text).trim()}${withValues ? ` — ${brl(i.value)}` : ''}`)
    const header = settings.descricao_padrao ? `${settings.descricao_padrao}\n` : ''
    const body = lines.length ? lines.join('\n') : `Serviços prestados conforme cobrança #${billing.id}.`
    return (header + body).slice(0, 2000)
}

// Textos padrão com as variáveis da cobrança: {vencimento}, {valor}, {cobranca}.
function resolveTexto(texto: string, billing: any): string {
    const due = billing?.due_date ? new Date(billing.due_date) : null
    const vencimento = due ? due.toISOString().slice(0, 10).split('-').reverse().join('/') : ''
    return String(texto)
        .replace(/\{vencimento\}/g, vencimento)
        .replace(/\{valor\}/g, brl(billing?.total_value))
        .replace(/\{cobranca\}/g, `#${billing?.id ?? ''}`)
}

function textosFor(billing: any, settings: NfseSettings) {
    return settings.textos_padrao.map((t) => ({ id: t.id, titulo: t.titulo, metodo: t.metodo, texto: resolveTexto(t.texto, billing) }))
}

function expensesIncluded(billing: any): number {
    let total = 0
    for (const bp of billing.BillingProtocols || [])
        for (const r of bp.Protocol?.Protocol_registers || []) if (r.type === 'Despesa') total += Number(r.value) || 0
    return Math.round(total * 100) / 100
}

export async function nfseDraft(billingId: number) {
    const billing: any = await loadBilling(billingId)
    if (!billing) throw new NfseError('Cobrança não encontrada', 404)

    const settings = await getNfseSettings()
    const cert = await getCertificateInfo()
    const problems = settingsProblems(settings, cert)
    const t = resolveTomador(billing)
    problems.push(...t.problems)
    const warnings = [...t.warnings]

    const notas = await Nfse.findAll({
        where: { BillingId: billing.id },
        attributes: { exclude: ['xml_dps', 'xml_nfse', 'xml_evento'] },
        order: [['id', 'DESC']],
    })
    const active = notas.find((n) => ACTIVE.includes(n.status as string))
    if (active)
        problems.push(
            active.status === 'autorizada'
                ? `Esta cobrança já tem a NFS-e nº ${active.numero_nfse} autorizada.`
                : 'Há uma NFS-e desta cobrança aguardando confirmação da Sefin — use "Verificar".',
        )

    if (t.docInvalido) warnings.push(t.docInvalido)

    // Exportação: sugere os dados do tomador do exterior usados na última nota deste cliente.
    let exterior: any = null
    if (billing.ClientId) {
        const last = await Nfse.findOne({
            where: { status: ['autorizada', 'substituida', 'cancelada'] },
            include: [{ model: Billing, where: { ClientId: billing.ClientId }, attributes: [] }],
            attributes: ['tomador_exterior'],
            order: [['id', 'DESC']],
        }).catch(() => null)
        exterior = last?.tomador_exterior || null
    }

    const expenses = expensesIncluded(billing)
    if (expenses > 0)
        warnings.push(`Os protocolos desta cobrança incluem ${expenses.toFixed(2).replace('.', ',')} em despesas/reembolsos: confira se devem entrar no valor da nota.`)
    if (billing.status === 'cancelado') problems.push('Cobrança cancelada.')

    return {
        ambiente: settings.ambiente,
        tomador: t.tomador,
        defaults: {
            valor: Number(billing.total_value) || 0,
            descricao: defaultDescription(billing, settings),
            // Pré-seleciona o texto padrão ligado à forma de pagamento da cobrança.
            texto_padrao_id: settings.textos_padrao.find((t) => t.metodo && t.metodo === billing.method)?.id || '',
            competencia: todayBR(),
            iss_retido: false,
            ctribnac: settings.ctribnac,
            ctribmun: settings.ctribmun,
            cnbs: settings.cnbs,
            info_complementar: '',
            exterior: exterior ? { ...exterior, ativo: !!t.docInvalido } : { ativo: !!t.docInvalido, cNaoNIF: '', moeda: 'USD', pais_resultado: true },
        },
        textos_padrao: textosFor(billing, settings),
        problems,
        warnings,
        notas,
    }
}

export interface EmitInput {
    valor: number
    descricao: string
    competencia?: string
    iss_retido?: boolean
    ctribnac?: string
    ctribmun?: string
    cnbs?: string
    info_complementar?: string
    texto_padrao_id?: string // texto padrão acrescentado ao fim da descrição
    // Tomador no exterior (exportação de serviço).
    exterior?: {
        ativo?: boolean
        nome?: string
        nif?: string
        cNaoNIF?: string
        cPais?: string
        cEndPost?: string
        xCidade?: string
        xEstProvReg?: string
        logradouro?: string
        numero?: string
        complemento?: string
        bairro?: string
        email?: string
        moeda?: string
        valor_moeda?: number | string
        pais_resultado?: boolean
    } | null
}

// Moedas mais comuns (código BACEN); aceita também o código numérico de 3 dígitos.
const MOEDAS: Record<string, string> = { USD: '220', EUR: '978', GBP: '540', CAD: '165', AUD: '150', CHF: '425', JPY: '470', ARS: '706', BRL: '790' }

function validateExterior(raw: NonNullable<EmitInput['exterior']>, settings: NfseSettings, cnbs: string) {
    const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
    const cPais = str(raw.cPais, 2).toUpperCase()
    if (!/^[A-Z]{2}$/.test(cPais) || cPais === 'BR') throw new NfseError('Tomador do exterior: informe o país (código ISO de 2 letras, diferente de BR).')
    const nif = str(raw.nif, 40)
    const cNaoNIF = String(raw.cNaoNIF || '')
    if (!nif && !['1', '2'].includes(cNaoNIF)) throw new NfseError('Tomador do exterior: informe o NIF (identificação fiscal no país dele) ou o motivo de não ter.')
    const nome = str(raw.nome, 300)
    const required: [string, string, number][] = [
        ['cEndPost', 'código postal', 11],
        ['xCidade', 'cidade', 60],
        ['xEstProvReg', 'estado/província/região', 60],
        ['logradouro', 'endereço', 255],
    ]
    const ext: DpsExterior = {
        nif: nif || null,
        cNaoNIF: nif ? null : (cNaoNIF as '1' | '2'),
        cPais,
        cEndPost: str(raw.cEndPost, 11),
        xCidade: str(raw.xCidade, 60),
        xEstProvReg: str(raw.xEstProvReg, 60),
        logradouro: str(raw.logradouro, 255),
        numero: str(raw.numero, 60) || 'S/N',
        complemento: str(raw.complemento, 156) || null,
        bairro: str(raw.bairro, 60) || null,
    }
    for (const [field, label] of required) if (!(ext as any)[field]) throw new NfseError(`Tomador do exterior: informe ${label}.`)
    const moedaIn = str(raw.moeda, 3).toUpperCase()
    const tpMoeda = MOEDAS[moedaIn] || (/^\d{3}$/.test(moedaIn) ? moedaIn : '')
    if (!tpMoeda) throw new NfseError('Tomador do exterior: moeda inválida (use USD, EUR, GBP... ou o código BACEN).')
    const vServMoeda = Math.round(Number(String(raw.valor_moeda ?? '').replace(',', '.')) * 100) / 100
    if (!(vServMoeda > 0)) throw new NfseError('Tomador do exterior: informe o valor do serviço na moeda estrangeira.')
    // Exportação exige NBS (E0318) e regime especial "nenhum" (E0172).
    if (!cnbs) throw new NfseError('Exportação de serviço exige o código NBS.')
    if (settings.reg_esp_trib !== '0') throw new NfseError('Exportação de serviço exige regime especial de tributação "Nenhum" (Configuração da NFS-e).')
    const email = str(raw.email, 80)
    return {
        nome,
        email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
        exterior: ext,
        comExt: {
            mdPrestacao: settings.exp_md_prestacao,
            vincPrest: settings.exp_vinc_prest,
            tpMoeda,
            vServMoeda,
            mecAFComexP: settings.exp_mec_prest,
            mecAFComexT: settings.exp_mec_toma,
            movTempBens: settings.exp_mov_temp,
            mdic: settings.exp_mdic,
        },
        moeda: moedaIn,
        // País onde se verificou o resultado: exigido quando a incidência é no estabelecimento do prestador (E0590).
        cPaisResult: raw.pais_resultado === false ? null : cPais,
    }
}

function validateInput(input: EmitInput, settings: NfseSettings, billing?: any) {
    const valor = Math.round(Number(String(input.valor ?? '').replace(',', '.')) * 100) / 100
    if (!(valor > 0)) throw new NfseError('Informe o valor do serviço.')
    let descricao = String(input.descricao || '').trim()
    if (!descricao) throw new NfseError('Informe a descrição do serviço.')
    if (input.texto_padrao_id) {
        const t = settings.textos_padrao.find((x) => x.id === input.texto_padrao_id)
        if (!t) throw new NfseError('Texto padrão não encontrado (Configuração da NFS-e).')
        descricao = `${descricao}\n\n${resolveTexto(t.texto, billing)}`
    }
    if (descricao.length > 2000) throw new NfseError('A descrição do serviço (com o texto padrão) passa de 2000 caracteres.')
    const competencia = String(input.competencia || todayBR())
    if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia) || isNaN(Date.parse(competencia))) throw new NfseError('Data de competência inválida.')
    if (competencia > todayBR()) throw new NfseError('A competência não pode ser posterior à data de emissão.')
    const info = String(input.info_complementar || '').trim()
    if (info.length > 2000) throw new NfseError('Informações complementares passam de 2000 caracteres.')

    const ctribnac = onlyDigits(input.ctribnac || settings.ctribnac)
    if (!/^\d{6}$/.test(ctribnac)) throw new NfseError('Código de tributação nacional deve ter 6 dígitos.')
    const ctribmun = onlyDigits(input.ctribmun ?? settings.ctribmun)
    if (ctribmun && !/^\d{3}$/.test(ctribmun)) throw new NfseError('Código de tributação municipal deve ter 3 dígitos.')
    const cnbs = onlyDigits(input.cnbs ?? settings.cnbs)
    if (cnbs && !/^\d{9}$/.test(cnbs)) throw new NfseError('Código NBS deve ter 9 dígitos.')

    const exterior = input.exterior?.ativo ? validateExterior(input.exterior, settings, cnbs) : null
    if (exterior && input.iss_retido) throw new NfseError('Exportação de serviço não tem retenção de ISS.')

    // ME/EPP com ISS no Simples: alíquota só é informada quando o tomador retém o ISS (E0621/E0625).
    const issRetido = !!input.iss_retido
    let pAliq: number | null = null
    if (issRetido) {
        pAliq = Number(String(settings.aliquota_iss).replace(',', '.'))
        if (!(pAliq > 0 && pAliq <= 5)) throw new NfseError('Para ISS retido, configure a alíquota do ISS (Configurações → NFS-e).')
    }
    return { valor, descricao, competencia, info, ctribnac, ctribmun, cnbs, issRetido, pAliq, exterior }
}

async function attachPdf(nfse: Nfse, billing: Billing | null): Promise<string | null> {
    if (!billing || !nfse.xml_nfse) return null
    try {
        const pdf = await danfsePdf(nfse.xml_nfse, nfse.ambiente)
        const filename = `NFS-e_${nfse.numero_nfse || nfse.id}.pdf`
        const url = await CloudFlareR2.uploadFile(`billings/${billing.id}/nota_fiscal/${Date.now()}_${filename}`, pdf, 'application/pdf')
        const file = await BillingFile.create({ BillingId: billing.id, type: 'nota_fiscal', filename, url })
        await nfse.update({ BillingFileId: file.id })
        return null
    } catch (err: any) {
        console.error('NFS-e: falha ao gerar/anexar o DANFSe', err)
        return `A nota foi autorizada, mas o PDF não pôde ser anexado (${err?.message || err}). Baixe pelo botão "PDF".`
    }
}

// Nota cancelada/substituída: o PDF anexado deixa de valer como nota fiscal da cobrança.
async function detachPdf(nfse: Nfse) {
    if (!nfse.BillingFileId) return
    await BillingFile.destroy({ where: { id: nfse.BillingFileId } })
    await nfse.update({ BillingFileId: null })
}

async function finalize(nfse: Nfse, xmlNfse: string, alertas: SefinMessage[]) {
    const parsed = parseNfseXml(xmlNfse)
    await nfse.update({
        status: 'autorizada',
        chave_acesso: parsed.chaveAcesso,
        numero_nfse: parsed.numero,
        data_processamento: parsed.dhProc ? new Date(parsed.dhProc) : new Date(),
        xml_nfse: xmlNfse,
        erros: null,
        alertas: alertas.length ? alertas : null,
    })

    // Substituta autorizada: a Sefin cancela a original por substituição; o PDF antigo sai da cobrança.
    if (nfse.substitui_id) {
        const original = await Nfse.findByPk(nfse.substitui_id)
        if (original) {
            await detachPdf(original)
            await original.update({ status: 'substituida', substituta_id: nfse.id, data_cancelamento: new Date() })
        }
    }

    const billing = nfse.BillingId ? await Billing.findByPk(nfse.BillingId) : null
    const pdfWarning = await attachPdf(nfse, billing)
    if (pdfWarning) await nfse.update({ alertas: [...alertas, { codigo: 'PDF', descricao: pdfWarning }] })
    // Mesmo efeito do envio manual da nota: a cobrança pendente passa a faturada.
    if (billing && billing.status === 'pendente') await billing.update({ status: 'faturada' })
}

// `retry` evita laço: um reenvio feito a partir da consulta não dispara outra consulta/reenvio.
async function handleEmitResponse(nfse: Nfse, res: SefinResponse, client: ReturnType<typeof createSefinClient>, retry = true): Promise<void> {
    const body = res.body && typeof res.body === 'object' ? res.body : {}
    if (res.status >= 200 && res.status < 300 && body.chaveAcesso && body.nfseXmlGZipB64) {
        await finalize(nfse, gunzipB64(body.nfseXmlGZipB64), normalizeMessages(body.alertas))
        return
    }

    const erros = normalizeMessages(body.erros ?? body.Erros ?? body.erro ?? body.Erro)
    // DPS já transformada em NFS-e (envio anterior que chegou lá): recupera a nota em vez de rejeitar.
    if (retry && erros.some((e) => e.codigo === 'E0014')) return syncPending(nfse, client, false)

    if (res.status >= 400 && res.status < 500 && erros.length) {
        await nfse.update({ status: 'rejeitada', erros })
        return
    }
    // 5xx, 403 de mTLS, resposta inesperada: não dá para saber se a nota foi gerada.
    await nfse.update({
        status: 'processando',
        erros: erros.length
            ? erros
            : [{ codigo: `HTTP ${res.status}`, descricao: res.status === 403 ? 'Acesso negado pela Sefin (certificado recusado na conexão).' : 'Resposta inesperada da Sefin Nacional.' }],
    })
}

async function syncPending(nfse: Nfse, client: ReturnType<typeof createSefinClient>, retry = true): Promise<void> {
    const res = await client.consultarDps(nfse.id_dps)
    if (res.status === 200 && res.body?.chaveAcesso) {
        const nf = await client.consultarNfse(res.body.chaveAcesso)
        if (nf.status === 200 && nf.body?.nfseXmlGZipB64) return finalize(nfse, gunzipB64(nf.body.nfseXmlGZipB64), [])
        await nfse.update({ erros: [{ codigo: `HTTP ${nf.status}`, descricao: 'NFS-e gerada, mas não foi possível baixar o XML. Tente "Verificar" de novo.' }] })
        return
    }
    if (res.status === 404 && retry) {
        // A Sefin não gerou nota para esta DPS: reenvia a mesma DPS assinada (mesmo número, sem duplicar).
        return handleEmitResponse(nfse, await client.emitir(nfse.xml_dps), client, false)
    }
    await nfse.update({ erros: [{ codigo: `HTTP ${res.status}`, descricao: 'Não foi possível consultar a DPS na Sefin Nacional. Tente novamente em instantes.' }] })
}

async function clientFor(ambiente: NfseSettings['ambiente']) {
    const cert = await loadCertificate()
    return { cert, client: createSefinClient(ambiente, cert.pfx, cert.password) }
}

type Validated = ReturnType<typeof validateInput>

// Reserva o número, monta e assina a DPS, grava a nota como "processando" e envia à Sefin.
async function createAndSend(params: {
    billingId: number
    settings: NfseSettings
    v: Validated
    tomador: DpsPessoa
    userId?: number | null
    substitui?: Nfse | null
    subst?: DpsInput['subst']
}) {
    const { billingId, settings, v, userId, substitui } = params
    const { cert, client } = await clientFor(settings.ambiente)
    if (cert.info.cnpj && cert.info.cnpj !== settings.cnpj)
        throw new NfseError(`O certificado é do CNPJ ${cert.info.cnpj}, diferente do CNPJ do prestador configurado.`)

    const tomador: DpsPessoa = v.exterior
        ? { documento: '', nome: v.exterior.nome || params.tomador.nome, email: v.exterior.email || params.tomador.email, exterior: v.exterior.exterior }
        : params.tomador
    if (!tomador.nome) throw new NfseError('Informe o nome do tomador.')

    const nfse = await db.transaction(async (transaction) => {
        // Trava a cobrança: dois cliques simultâneos não geram duas notas.
        await Billing.findByPk(billingId, { lock: transaction.LOCK.UPDATE, transaction })
        const others = await Nfse.count({
            where: substitui
                ? { BillingId: billingId, status: 'processando' }
                : { BillingId: billingId, status: ACTIVE },
            transaction,
        })
        if (others) throw new NfseError(substitui ? 'Há uma NFS-e desta cobrança em processamento: use "Verificar" antes.' : 'Esta cobrança já tem NFS-e emitida ou em processamento.')

        const numero = await nextDpsNumber(settings, transaction, Nfse)
        const xml = buildDpsXml({
            ambiente: settings.ambiente,
            // Alguns segundos para trás: a Sefin rejeita dhEmi posterior ao processamento (E0008) se o relógio adiantar.
            dhEmi: new Date(Date.now() - 30_000),
            serie: settings.serie,
            numero,
            competencia: v.competencia,
            cLocEmi: settings.municipio_ibge,
            subst: params.subst || null,
            prestador: {
                cnpj: settings.cnpj,
                im: settings.im || null,
                opSimpNac: settings.op_simples,
                regApTribSN: settings.reg_ap_trib_sn,
                regEspTrib: settings.reg_esp_trib,
            },
            tomador,
            servico: {
                cLocPrestacao: settings.municipio_ibge,
                cTribNac: v.ctribnac,
                cTribMun: v.ctribmun || null,
                descricao: v.descricao,
                cNBS: v.cnbs || null,
                infoComplementar: v.info || null,
                comExt: v.exterior?.comExt || null,
            },
            valores: {
                vServ: v.valor,
                tpRetISSQN: v.issRetido ? '2' : '1',
                pAliq: v.pAliq,
                pTotTribSN: settings.op_simples === '3' ? Number(String(settings.ptottribsn).replace(',', '.')) : null,
                tribISSQN: v.exterior ? '3' : '1',
                cPaisResult: v.exterior?.cPaisResult || null,
            },
            ibscbs: ibscbsFromSettings(settings),
        })
        return Nfse.create(
            {
                status: 'processando',
                ambiente: settings.ambiente,
                serie: settings.serie,
                numero_dps: numero,
                id_dps: buildDpsId(settings.municipio_ibge, settings.cnpj, settings.serie, numero),
                competencia: v.competencia,
                valor_servico: v.valor,
                descricao: v.descricao,
                tomador_documento: v.exterior ? v.exterior.exterior.nif || 'EXTERIOR' : tomador.documento,
                tomador_nome: tomador.nome,
                tomador_exterior: v.exterior
                    ? { ...v.exterior.exterior, nome: tomador.nome, email: tomador.email, moeda: v.exterior.moeda, valor_moeda: v.exterior.comExt.vServMoeda, pais_resultado: !!v.exterior.cPaisResult }
                    : null,
                substitui_id: substitui?.id ?? null,
                xml_dps: signDps(xml, cert.keyPem, cert.certPem),
                BillingId: billingId,
                UserId: userId ?? null,
            },
            { transaction },
        )
    })

    try {
        await handleEmitResponse(nfse, await client.emitir(nfse.xml_dps), client)
    } catch (err: any) {
        await nfse.update({
            status: 'processando',
            erros: [{ codigo: 'REDE', descricao: `Sem resposta da Sefin Nacional (${err?.message || err}). Use "Verificar" para confirmar se a nota foi gerada.` }],
        })
    }
    return nfse.reload()
}

export async function emitNfseForBilling(billingId: number, input: EmitInput, userId?: number | null) {
    const draft = await nfseDraft(billingId)
    if (draft.problems.length) throw new NfseError('Não é possível emitir a NFS-e.', 400, draft.problems)
    const settings = await getNfseSettings()
    const v = validateInput(input, settings, await Billing.findByPk(billingId))
    const tomador = draft.tomador as DpsPessoa
    if (!v.exterior && !isValidCnpj(tomador.documento) && !isValidCpf(tomador.documento))
        throw new NfseError('O tomador não tem CPF/CNPJ válido: corrija o cadastro ou emita como tomador do exterior.')
    return createAndSend({ billingId, settings, v, tomador, userId })
}

// ---------- Substituição ----------
// 01 desenquadramento do Simples · 02 enquadramento no Simples · 03/04 inclusão/exclusão retroativa de imunidade/isenção
// 05 rejeição pelo tomador · 99 outros
export const MOTIVOS_SUBSTITUICAO: Record<string, string> = {
    '01': 'Desenquadramento do Simples Nacional',
    '02': 'Enquadramento no Simples Nacional',
    '03': 'Inclusão retroativa de imunidade/isenção',
    '04': 'Exclusão retroativa de imunidade/isenção',
    '05': 'Rejeição da NFS-e pelo tomador',
    '99': 'Outros',
}

async function loadAuthorized(nfseId: number) {
    const nfse = await Nfse.findByPk(nfseId)
    if (!nfse) throw new NfseError('NFS-e não encontrada', 404)
    if (nfse.status !== 'autorizada' || !nfse.chave_acesso || !nfse.xml_nfse) throw new NfseError('Só NFS-e autorizada pode ser cancelada ou substituída.')
    return nfse
}

// ME/EPP e MEI não podem alterar tomador, competência nem valor na substituição (regra E0061).
const lockedForSimples = (settings: NfseSettings) => settings.op_simples === '2' || settings.op_simples === '3'

export async function substitutionDraft(nfseId: number) {
    const nfse = await loadAuthorized(nfseId)
    const settings = await getNfseSettings()
    const p = parseNfseXml(nfse.xml_nfse as string)
    return {
        ambiente: nfse.ambiente,
        original: { id: nfse.id, numero_nfse: nfse.numero_nfse, chave_acesso: nfse.chave_acesso },
        tomador: { nome: nfse.tomador_nome, documento: nfse.tomador_documento },
        bloqueados: lockedForSimples(settings) ? ['valor', 'competencia', 'tomador'] : [],
        motivos: MOTIVOS_SUBSTITUICAO,
        textos_padrao: textosFor(nfse.BillingId ? await Billing.findByPk(nfse.BillingId) : null, settings),
        defaults: {
            valor: Number(nfse.valor_servico),
            competencia: nfse.competencia,
            descricao: p.dps.descricao || nfse.descricao,
            iss_retido: p.dps.tpRetISSQN === '2',
            ctribnac: p.dps.cTribNac || settings.ctribnac,
            ctribmun: p.dps.cTribMun || '',
            cnbs: p.dps.cNBS || '',
            info_complementar: p.dps.infoComplementar || '',
            exterior: nfse.tomador_exterior ? { ...nfse.tomador_exterior, ativo: true } : { ativo: false },
            texto_padrao_id: '',
            cMotivo: '99',
            xMotivo: '',
        },
    }
}

export async function substituteNfse(nfseId: number, input: EmitInput & { cMotivo?: string; xMotivo?: string }, userId?: number | null) {
    const original = await loadAuthorized(nfseId)
    if (!original.BillingId) throw new NfseError('NFS-e sem cobrança vinculada.')
    const cMotivo = String(input.cMotivo || '')
    if (!MOTIVOS_SUBSTITUICAO[cMotivo]) throw new NfseError('Informe o motivo da substituição.')
    const xMotivo = String(input.xMotivo || '').trim()
    if (xMotivo && (xMotivo.length < 15 || xMotivo.length > 255)) throw new NfseError('A descrição do motivo deve ter entre 15 e 255 caracteres.')
    if (cMotivo === '99' && !xMotivo) throw new NfseError('Para "Outros", descreva o motivo (15 a 255 caracteres).')

    const settings = await getNfseSettings()
    const problems = settingsProblems(settings, await getCertificateInfo())
    if (problems.length) throw new NfseError('Não é possível emitir a NFS-e.', 400, problems)

    const locked = lockedForSimples(settings)
    const wasExterior = !!original.tomador_exterior
    const v = validateInput(
        locked
            ? { ...input, valor: Number(original.valor_servico), competencia: original.competencia, exterior: wasExterior ? { ...original.tomador_exterior, ...(input.exterior || {}), ativo: true } : null }
            : input,
        settings,
        await Billing.findByPk(original.BillingId),
    )
    if (locked && wasExterior && v.exterior && (v.exterior.exterior.nif || '') !== (original.tomador_exterior?.nif || ''))
        throw new NfseError('Optante do Simples não pode trocar o tomador na substituição.')

    // Tomador: o da nota original (para o Simples é obrigatório manter).
    const draft = await nfseDraft(original.BillingId).catch(() => null)
    const atual = draft?.tomador as DpsPessoa | undefined
    let tomador: DpsPessoa
    if (wasExterior || v.exterior) tomador = { documento: '', nome: original.tomador_nome, email: original.tomador_exterior?.email || null }
    else {
        if (!atual || atual.documento !== original.tomador_documento) {
            if (locked) throw new NfseError('O CPF/CNPJ do cliente mudou desde a emissão: optante do Simples não pode trocar o tomador na substituição.')
        }
        tomador = atual && atual.documento === original.tomador_documento ? atual : { documento: original.tomador_documento, nome: original.tomador_nome }
    }

    return createAndSend({
        billingId: original.BillingId,
        settings,
        v,
        tomador,
        userId,
        substitui: original,
        subst: { chave: original.chave_acesso as string, cMotivo, xMotivo: xMotivo || null },
    })
}

// ---------- Cancelamento ----------
async function markCancelled(nfse: Nfse, xmlEvento: string | null) {
    await detachPdf(nfse)
    await nfse.update({ status: 'cancelada', data_cancelamento: new Date(), xml_evento: xmlEvento, cancelamento_solicitado_em: null, erros: null })
}

function eventXmlFrom(body: any): string | null {
    if (!body || typeof body !== 'object') return null
    const b64 = body.eventoXmlGZipB64 || body.EventoXmlGZipB64 || (Array.isArray(body.eventos) && body.eventos[0]?.eventoXmlGZipB64)
    try {
        return b64 ? gunzipB64(b64) : null
    } catch {
        return null
    }
}

export async function cancelNfse(nfseId: number, input: { cMotivo?: string; xMotivo?: string }, userId?: number | null) {
    const nfse = await loadAuthorized(nfseId)
    const cMotivo = String(input.cMotivo || '')
    if (!MOTIVOS_CANCELAMENTO[cMotivo]) throw new NfseError('Informe o motivo do cancelamento.')
    const xMotivo = String(input.xMotivo || '').trim()
    if (xMotivo.length < 15 || xMotivo.length > 255) throw new NfseError('Descreva o motivo do cancelamento (15 a 255 caracteres).')

    const settings = await getNfseSettings()
    const { cert, client } = await clientFor(nfse.ambiente)
    const xml = signPedRegEvento(
        buildCancelamentoXml({ ambiente: nfse.ambiente, cnpjAutor: settings.cnpj, chave: nfse.chave_acesso as string, cMotivo, xMotivo }),
        cert.keyPem,
        cert.certPem,
    )
    await nfse.update({ cancelamento_motivo: `${cMotivo} — ${xMotivo}`.slice(0, 300), cancelamento_solicitado_em: new Date() })

    let res: SefinResponse
    try {
        res = await client.registrarEvento(nfse.chave_acesso as string, xml)
    } catch (err: any) {
        await nfse.update({ erros: [{ codigo: 'REDE', descricao: `Sem resposta da Sefin ao cancelar (${err?.message || err}). Use "Verificar" para confirmar.` }] })
        return nfse.reload()
    }
    if (res.status >= 200 && res.status < 300) {
        await markCancelled(nfse, eventXmlFrom(res.body))
        return nfse.reload()
    }
    const erros = normalizeMessages(res.body?.erro ?? res.body?.erros ?? res.body?.Erro ?? res.body?.Erros)
    if (res.status >= 400 && res.status < 500 && erros.length) {
        // Recusado: a nota segue autorizada.
        await nfse.update({ cancelamento_solicitado_em: null, cancelamento_motivo: null })
        throw new NfseError('A Sefin recusou o cancelamento.', 400, erros.map((e) => `${e.codigo} — ${e.descricao}${e.complemento ? ` (${e.complemento})` : ''}`))
    }
    await nfse.update({ erros: [{ codigo: `HTTP ${res.status}`, descricao: 'Resposta inesperada da Sefin ao cancelar. Use "Verificar" para confirmar.' }] })
    return nfse.reload()
}

async function syncCancellation(nfse: Nfse, client: ReturnType<typeof createSefinClient>) {
    const res = await client.consultarEvento(nfse.chave_acesso as string, EVENTO_CANCELAMENTO)
    if (res.status === 200) return markCancelled(nfse, eventXmlFrom(res.body))
    if (res.status === 404) {
        await nfse.update({ cancelamento_solicitado_em: null, erros: [{ codigo: 'CANC', descricao: 'O cancelamento não foi registrado na Sefin. Tente cancelar novamente.' }] })
        return
    }
    await nfse.update({ erros: [{ codigo: `HTTP ${res.status}`, descricao: 'Não foi possível consultar o cancelamento. Tente novamente em instantes.' }] })
}

export async function syncNfse(nfseId: number) {
    const nfse = await Nfse.findByPk(nfseId)
    if (!nfse) throw new NfseError('NFS-e não encontrada', 404)
    const cancelPending = nfse.status === 'autorizada' && !!nfse.cancelamento_solicitado_em
    if (nfse.status !== 'processando' && !cancelPending) return nfse
    const { client } = await clientFor(nfse.ambiente)
    try {
        if (cancelPending) await syncCancellation(nfse, client)
        else await syncPending(nfse, client)
    } catch (err: any) {
        await nfse.update({ erros: [{ codigo: 'REDE', descricao: `Sem resposta da Sefin Nacional (${err?.message || err}).` }] })
    }
    return nfse.reload()
}

export async function nfsePdf(nfseId: number) {
    const nfse = await Nfse.findByPk(nfseId)
    if (!nfse || !nfse.xml_nfse) throw new NfseError('NFS-e não encontrada ou ainda não autorizada.', 404)
    return { nfse, pdf: await danfsePdf(nfse.xml_nfse, nfse.ambiente) }
}
