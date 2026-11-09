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
import { buildDpsId, buildDpsXml, DpsPessoa, isValidCnpj, isValidCpf, onlyDigits, todayBR } from './dps'
import { signDps } from './sign'
import { createSefinClient, gunzipB64, normalizeMessages, SefinMessage, SefinResponse } from './sefinClient'
import { parseNfseXml } from './parseNfse'
import { danfsePdf } from './danfse'
import { getCertificateInfo, getNfseSettings, loadCertificate, nextDpsNumber, NfseSettings, settingsProblems } from './settings'

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
function resolveTomador(billing: any): { tomador: DpsPessoa | null; problems: string[]; warnings: string[] } {
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
    if (!isValidCnpj(doc) && !isValidCpf(doc)) problems.push(`O cliente ${c.name} não tem CPF/CNPJ válido no cadastro.`)

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
    }
}

function defaultDescription(billing: any, settings: NfseSettings): string {
    if (settings.descricao_padrao) return settings.descricao_padrao
    const lines: string[] = []
    for (const bp of billing.BillingProtocols || []) {
        const p = bp.Protocol
        if (!p) continue
        for (const r of p.Protocol_registers || []) if (r.type === 'Serviço' && r.description) lines.push(r.description)
        for (const pp of p.Protocol_products || []) if (pp.Product?.description) lines.push(pp.Product.description)
    }
    const unique = [...new Set(lines.map((l) => String(l).trim()).filter(Boolean))]
    const text = unique.length ? unique.map((l) => `- ${l}`).join('\n') : `Serviços prestados conforme cobrança #${billing.id}.`
    return text.slice(0, 2000)
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
        attributes: { exclude: ['xml_dps', 'xml_nfse'] },
        order: [['id', 'DESC']],
    })
    const active = notas.find((n) => ACTIVE.includes(n.status as string))
    if (active)
        problems.push(
            active.status === 'autorizada'
                ? `Esta cobrança já tem a NFS-e nº ${active.numero_nfse} autorizada.`
                : 'Há uma NFS-e desta cobrança aguardando confirmação da Sefin — use "Verificar".',
        )

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
            competencia: todayBR(),
            iss_retido: false,
            ctribnac: settings.ctribnac,
            ctribmun: settings.ctribmun,
            cnbs: settings.cnbs,
            info_complementar: '',
        },
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
}

function validateInput(input: EmitInput, settings: NfseSettings) {
    const valor = Math.round(Number(String(input.valor ?? '').replace(',', '.')) * 100) / 100
    if (!(valor > 0)) throw new NfseError('Informe o valor do serviço.')
    const descricao = String(input.descricao || '').trim()
    if (!descricao) throw new NfseError('Informe a descrição do serviço.')
    if (descricao.length > 2000) throw new NfseError('A descrição do serviço passa de 2000 caracteres.')
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

    // ME/EPP com ISS no Simples: alíquota só é informada quando o tomador retém o ISS (E0621/E0625).
    const issRetido = !!input.iss_retido
    let pAliq: number | null = null
    if (issRetido) {
        pAliq = Number(String(settings.aliquota_iss).replace(',', '.'))
        if (!(pAliq > 0 && pAliq <= 5)) throw new NfseError('Para ISS retido, configure a alíquota do ISS (Configurações → NFS-e).')
    }
    return { valor, descricao, competencia, info, ctribnac, ctribmun, cnbs, issRetido, pAliq }
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

export async function emitNfseForBilling(billingId: number, input: EmitInput, userId?: number | null) {
    const draft = await nfseDraft(billingId)
    if (draft.problems.length) throw new NfseError('Não é possível emitir a NFS-e.', 400, draft.problems)
    const settings = await getNfseSettings()
    const v = validateInput(input, settings)
    const { cert, client } = await clientFor(settings.ambiente)
    if (cert.info.cnpj && cert.info.cnpj !== settings.cnpj)
        throw new NfseError(`O certificado é do CNPJ ${cert.info.cnpj}, diferente do CNPJ do prestador configurado.`)

    const tomador = draft.tomador as DpsPessoa
    const nfse = await db.transaction(async (transaction) => {
        // Trava a cobrança: dois cliques simultâneos não geram duas notas.
        await Billing.findByPk(billingId, { lock: transaction.LOCK.UPDATE, transaction })
        const active = await Nfse.count({ where: { BillingId: billingId, status: ACTIVE }, transaction })
        if (active) throw new NfseError('Esta cobrança já tem NFS-e emitida ou em processamento.')

        const numero = await nextDpsNumber(settings, transaction, Nfse)
        const xml = buildDpsXml({
            ambiente: settings.ambiente,
            // Alguns segundos para trás: a Sefin rejeita dhEmi posterior ao processamento (E0008) se o relógio adiantar.
            dhEmi: new Date(Date.now() - 30_000),
            serie: settings.serie,
            numero,
            competencia: v.competencia,
            cLocEmi: settings.municipio_ibge,
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
            },
            valores: {
                vServ: v.valor,
                tpRetISSQN: v.issRetido ? '2' : '1',
                pAliq: v.pAliq,
                pTotTribSN: settings.op_simples === '3' ? Number(String(settings.ptottribsn).replace(',', '.')) : null,
            },
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
                tomador_documento: tomador.documento,
                tomador_nome: tomador.nome,
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

export async function syncNfse(nfseId: number) {
    const nfse = await Nfse.findByPk(nfseId)
    if (!nfse) throw new NfseError('NFS-e não encontrada', 404)
    if (nfse.status !== 'processando') return nfse
    const { client } = await clientFor(nfse.ambiente)
    try {
        await syncPending(nfse, client)
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
