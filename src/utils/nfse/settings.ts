// Configuração da emissão de NFS-e (chaves "nfse_*" da tabela de configurações) e do certificado A1.
import Config from '../../models/Config'
import { decryptSecret, encryptSecret, parsePfx, CertificateInfo, LoadedCertificate } from './certificate'
import { Ambiente, isValidCnpj, onlyDigits } from './dps'

export interface NfseSettings {
    ambiente: Ambiente
    cnpj: string
    municipio_ibge: string // município emissor (cadastro do prestador) e local padrão da prestação
    im: string // só se a prefeitura tiver cadastro complementar no CNC NFS-e (senão a Sefin rejeita, E0120)
    op_simples: '1' | '2' | '3' // 1 não optante · 2 MEI · 3 ME/EPP
    reg_ap_trib_sn: '1' | '2' | '3'
    reg_esp_trib: string
    serie: string
    numero_inicial: number
    ctribnac: string
    ctribmun: string
    cnbs: string
    descricao_padrao: string
    ptottribsn: string // ME/EPP: % aproximado dos tributos no Simples (alíquota efetiva)
    aliquota_iss: string // usada só quando o ISS é retido pelo tomador
    // Reforma tributária (IBS/CBS): o grupo só vai na DPS quando os três códigos estão preenchidos.
    ibscbs_cindop: string // código indicador da operação (Anexo C), 6 dígitos
    ibscbs_cst: string // CST do IBS/CBS, 3 dígitos
    ibscbs_cclasstrib: string // classificação tributária, 6 dígitos
    ibscbs_indfinal: '0' | '1' // uso ou consumo pessoal
    // Exportação de serviço (tomador no exterior): padrões do grupo de comércio exterior.
    exp_md_prestacao: string // 1 transfronteiriço · 2 consumo no Brasil · 3 presença comercial no exterior · 4 movimento temporário de pessoas
    exp_vinc_prest: string // 0 sem vínculo com o tomador
    exp_mec_prest: string // 01 nenhum mecanismo de apoio/fomento
    exp_mec_toma: string // 01 nenhum
    exp_mov_temp: string // 1 não vinculada a movimentação temporária de bens
    exp_mdic: '0' | '1' // compartilhar com a Secex/MDIC
    // Textos padrão escolhidos na emissão (ex.: instruções de pagamento), acrescentados à descrição do serviço.
    textos_padrao: TextoPadrao[]
}

export interface TextoPadrao {
    id: string
    titulo: string
    texto: string // aceita {vencimento}, {valor} e {cobranca}
    metodo: string // forma de pagamento da cobrança que pré-seleciona este texto ('' = nenhuma)
}

export const TEXTOS_PADRAO_KEY = 'nfse_textos_padrao'
const METODOS = ['', 'Pix', 'Boleto', 'Cartão', 'Transferência', 'Espécie']

// Chaves guardadas em "configs". Os segredos do certificado nunca saem pela API de configurações.
const KEYS: Record<Exclude<keyof NfseSettings, 'textos_padrao'>, string> = {
    ambiente: 'nfse_ambiente',
    cnpj: 'nfse_cnpj',
    municipio_ibge: 'nfse_municipio_ibge',
    im: 'nfse_im',
    op_simples: 'nfse_op_simples',
    reg_ap_trib_sn: 'nfse_reg_ap_trib_sn',
    reg_esp_trib: 'nfse_reg_esp_trib',
    serie: 'nfse_serie',
    numero_inicial: 'nfse_numero_inicial',
    ctribnac: 'nfse_ctribnac',
    ctribmun: 'nfse_ctribmun',
    cnbs: 'nfse_cnbs',
    descricao_padrao: 'nfse_descricao_padrao',
    ptottribsn: 'nfse_ptottribsn',
    aliquota_iss: 'nfse_aliquota_iss',
    ibscbs_cindop: 'nfse_ibscbs_cindop',
    ibscbs_cst: 'nfse_ibscbs_cst',
    ibscbs_cclasstrib: 'nfse_ibscbs_cclasstrib',
    ibscbs_indfinal: 'nfse_ibscbs_indfinal',
    exp_md_prestacao: 'nfse_exp_md_prestacao',
    exp_vinc_prest: 'nfse_exp_vinc_prest',
    exp_mec_prest: 'nfse_exp_mec_prest',
    exp_mec_toma: 'nfse_exp_mec_toma',
    exp_mov_temp: 'nfse_exp_mov_temp',
    exp_mdic: 'nfse_exp_mdic',
}

export const CERT_PFX_KEY = 'nfse_cert_pfx'
export const CERT_PASS_KEY = 'nfse_cert_pass'
export const CERT_INFO_KEY = 'nfse_cert_info'
export const NUMBER_LOCK_KEY = 'nfse_numero_lock'

// Configurações que a tela/API genérica de configurações não pode ler nem gravar.
// 'cert_pass' é a senha do certificado do cadastro antigo (não usada pela NFS-e), também não deve vazar.
export const PROTECTED_CONFIG_TYPES = [CERT_PFX_KEY, CERT_PASS_KEY, CERT_INFO_KEY, NUMBER_LOCK_KEY, 'cert_pass']

const DEFAULTS: NfseSettings = {
    ambiente: 'producao_restrita',
    cnpj: '',
    municipio_ibge: '',
    im: '',
    op_simples: '3',
    reg_ap_trib_sn: '1',
    reg_esp_trib: '0',
    serie: '1',
    numero_inicial: 1,
    ctribnac: '',
    ctribmun: '',
    cnbs: '',
    descricao_padrao: '',
    ptottribsn: '',
    aliquota_iss: '',
    ibscbs_cindop: '',
    ibscbs_cst: '',
    ibscbs_cclasstrib: '',
    ibscbs_indfinal: '0',
    exp_md_prestacao: '1',
    exp_vinc_prest: '0',
    exp_mec_prest: '01',
    exp_mec_toma: '01',
    exp_mov_temp: '1',
    exp_mdic: '0',
    textos_padrao: [],
}

async function configMap(types: string[]): Promise<Map<string, string>> {
    const rows = await Config.findAll({ where: { type: types } })
    return new Map(rows.map((r) => [r.type, r.value ?? '']))
}

async function setConfig(type: string, value: string, transaction?: any) {
    const [row, created] = await Config.findOrCreate({ where: { type }, defaults: { type, value, upload: false }, transaction })
    if (!created) await row.update({ value }, { transaction })
}

export async function getNfseSettings(): Promise<NfseSettings> {
    const map = await configMap([...Object.values(KEYS), 'cnpj', TEXTOS_PADRAO_KEY])
    const out: any = { ...DEFAULTS }
    try {
        const textos = JSON.parse(map.get(TEXTOS_PADRAO_KEY) || '[]')
        out.textos_padrao = Array.isArray(textos) ? textos : []
    } catch {
        out.textos_padrao = []
    }
    for (const [field, key] of Object.entries(KEYS)) {
        const v = map.get(key)
        if (v !== undefined && v !== null && v !== '') out[field] = v
    }
    out.numero_inicial = Math.max(1, parseInt(String(out.numero_inicial), 10) || 1)
    // Sem CNPJ próprio da NFS-e, usa o CNPJ da empresa já cadastrado em Configurações.
    if (!out.cnpj) out.cnpj = onlyDigits(map.get('cnpj'))
    out.cnpj = onlyDigits(out.cnpj)
    return out
}

const isDigits = (v: string, len: number) => new RegExp(`^\\d{${len}}$`).test(v)
const isPercent = (v: string, max: number) => v !== '' && !isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= max

// Normaliza e valida o que veio da tela. Devolve as mensagens de erro (vazio = ok).
export function normalizeSettings(input: Partial<Record<keyof NfseSettings, any>>): { values: Partial<NfseSettings>; errors: string[] } {
    const errors: string[] = []
    const values: any = {}
    const str = (v: any) => String(v ?? '').trim()

    if (input.ambiente !== undefined) {
        if (!['producao', 'producao_restrita'].includes(input.ambiente)) errors.push('Ambiente inválido.')
        else values.ambiente = input.ambiente
    }
    if (input.cnpj !== undefined) {
        const v = onlyDigits(input.cnpj)
        if (v && !isValidCnpj(v)) errors.push('CNPJ do prestador inválido.')
        values.cnpj = v
    }
    if (input.municipio_ibge !== undefined) {
        const v = onlyDigits(input.municipio_ibge)
        if (v && !isDigits(v, 7)) errors.push('Código IBGE do município deve ter 7 dígitos.')
        values.municipio_ibge = v
    }
    if (input.im !== undefined) {
        const v = str(input.im)
        if (v.length > 15) errors.push('Inscrição municipal com mais de 15 caracteres.')
        values.im = v
    }
    if (input.op_simples !== undefined) {
        if (!['2', '3'].includes(String(input.op_simples)))
            errors.push('Por enquanto a emissão atende optantes do Simples Nacional (ME/EPP ou MEI).')
        else values.op_simples = String(input.op_simples)
    }
    if (input.reg_ap_trib_sn !== undefined) {
        if (!['1', '2', '3'].includes(String(input.reg_ap_trib_sn))) errors.push('Regime de apuração do Simples inválido.')
        else values.reg_ap_trib_sn = String(input.reg_ap_trib_sn)
    }
    if (input.reg_esp_trib !== undefined) {
        if (!['0', '1', '2', '3', '4', '5', '6', '9'].includes(String(input.reg_esp_trib))) errors.push('Regime especial de tributação inválido.')
        else values.reg_esp_trib = String(input.reg_esp_trib)
    }
    if (input.serie !== undefined) {
        const n = parseInt(onlyDigits(input.serie), 10)
        // 00001 a 49999: faixa da série para emissão por aplicativo próprio (regra E0010).
        if (!(n >= 1 && n <= 49999)) errors.push('Série da DPS deve estar entre 1 e 49999 (emissão por sistema próprio).')
        else values.serie = String(n)
    }
    if (input.numero_inicial !== undefined) {
        const n = parseInt(String(input.numero_inicial), 10)
        if (!(n >= 1 && n <= 999999999999999)) errors.push('Próximo número da DPS inválido.')
        else values.numero_inicial = n
    }
    if (input.ctribnac !== undefined) {
        const v = onlyDigits(input.ctribnac)
        if (v && !isDigits(v, 6)) errors.push('Código de tributação nacional deve ter 6 dígitos (item, subitem e desdobro).')
        values.ctribnac = v
    }
    if (input.ctribmun !== undefined) {
        const v = onlyDigits(input.ctribmun)
        if (v && !isDigits(v, 3)) errors.push('Código de tributação municipal deve ter 3 dígitos.')
        values.ctribmun = v
    }
    if (input.cnbs !== undefined) {
        const v = onlyDigits(input.cnbs)
        if (v && !isDigits(v, 9)) errors.push('Código NBS deve ter 9 dígitos.')
        values.cnbs = v
    }
    if (input.descricao_padrao !== undefined) values.descricao_padrao = str(input.descricao_padrao).slice(0, 2000)
    if (input.ptottribsn !== undefined) {
        const v = str(input.ptottribsn).replace(',', '.')
        if (v && !isPercent(v, 99.99)) errors.push('Percentual aproximado de tributos do Simples inválido.')
        values.ptottribsn = v
    }
    if (input.aliquota_iss !== undefined) {
        const v = str(input.aliquota_iss).replace(',', '.')
        if (v && !isPercent(v, 5)) errors.push('Alíquota do ISS deve estar entre 0 e 5%.')
        values.aliquota_iss = v
    }
    const code = (field: keyof NfseSettings, len: number, label: string) => {
        if (input[field] === undefined) return
        const v = onlyDigits(input[field])
        if (v && !isDigits(v, len)) errors.push(`${label} deve ter ${len} dígitos.`)
        values[field] = v
    }
    code('ibscbs_cindop', 6, 'Código indicador da operação (IBS/CBS)')
    code('ibscbs_cst', 3, 'CST do IBS/CBS')
    code('ibscbs_cclasstrib', 6, 'Classificação tributária do IBS/CBS')
    const ibs = { ...values }
    if (['ibscbs_cindop', 'ibscbs_cst', 'ibscbs_cclasstrib'].some((k) => input[k as keyof NfseSettings] !== undefined)) {
        const filled = ['ibscbs_cindop', 'ibscbs_cst', 'ibscbs_cclasstrib'].filter((k) => ibs[k])
        if (filled.length && filled.length < 3) errors.push('Para declarar IBS/CBS, preencha o indicador da operação, o CST e a classificação tributária (ou deixe os três vazios).')
    }
    const choice = (field: keyof NfseSettings, allowed: string[], label: string) => {
        if (input[field] === undefined) return
        const v = String(input[field])
        if (!allowed.includes(v)) errors.push(`${label} inválido.`)
        else values[field] = v
    }
    choice('ibscbs_indfinal', ['0', '1'], 'Indicador de consumo pessoal')
    choice('exp_md_prestacao', ['1', '2', '3', '4'], 'Modo de prestação')
    choice('exp_vinc_prest', ['0', '1', '2', '3', '4', '5', '6'], 'Vínculo entre as partes')
    choice('exp_mec_prest', ['01', '02', '03', '04', '05', '06', '07', '08'], 'Mecanismo de apoio do prestador')
    choice('exp_mec_toma', Array.from({ length: 26 }, (_, i) => String(i + 1).padStart(2, '0')), 'Mecanismo de apoio do tomador')
    choice('exp_mov_temp', ['1', '2', '3'], 'Vínculo com movimentação temporária de bens')
    choice('exp_mdic', ['0', '1'], 'Compartilhamento com o MDIC')

    if (input.textos_padrao !== undefined) {
        const list = Array.isArray(input.textos_padrao) ? input.textos_padrao : []
        const textos: TextoPadrao[] = []
        list.forEach((t: any, i: number) => {
            const titulo = str(t?.titulo).slice(0, 80)
            const texto = str(t?.texto).slice(0, 1000)
            if (!titulo && !texto) return
            if (!titulo || !texto) return void errors.push(`Texto padrão ${i + 1}: informe o título e o texto.`)
            const metodo = METODOS.includes(String(t?.metodo || '')) ? String(t?.metodo || '') : ''
            textos.push({ id: str(t?.id) || `t${Date.now().toString(36)}${i}`, titulo, texto, metodo })
        })
        values.textos_padrao = textos
    }
    return { values, errors }
}

export function ibscbsFromSettings(s: NfseSettings) {
    if (!s.ibscbs_cindop || !s.ibscbs_cst || !s.ibscbs_cclasstrib) return null
    return { cIndOp: s.ibscbs_cindop, cst: s.ibscbs_cst, cClassTrib: s.ibscbs_cclasstrib, indFinal: s.ibscbs_indfinal || '0' }
}

export async function saveNfseSettings(values: Partial<NfseSettings>) {
    if (values.textos_padrao) await setConfig(TEXTOS_PADRAO_KEY, JSON.stringify(values.textos_padrao))
    for (const [field, value] of Object.entries(values)) {
        const key = (KEYS as any)[field]
        if (key) await setConfig(key, String(value ?? ''))
    }
}

export async function getCertificateInfo(): Promise<CertificateInfo | null> {
    const map = await configMap([CERT_INFO_KEY])
    const raw = map.get(CERT_INFO_KEY)
    if (!raw) return null
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

export async function saveCertificate(pfx: Buffer, password: string): Promise<CertificateInfo> {
    const cert = parsePfx(pfx, password)
    if (new Date(cert.info.notAfter).getTime() < Date.now()) throw new Error('Certificado vencido.')
    await setConfig(CERT_PFX_KEY, encryptSecret(pfx))
    await setConfig(CERT_PASS_KEY, encryptSecret(password))
    await setConfig(CERT_INFO_KEY, JSON.stringify(cert.info))
    return cert.info
}

export async function loadCertificate(): Promise<LoadedCertificate> {
    const map = await configMap([CERT_PFX_KEY, CERT_PASS_KEY])
    if (!map.get(CERT_PFX_KEY) || !map.get(CERT_PASS_KEY))
        throw new Error('Certificado digital A1 não configurado (Configurações → NFS-e).')
    const pfx = decryptSecret(map.get(CERT_PFX_KEY) as string)
    const password = decryptSecret(map.get(CERT_PASS_KEY) as string).toString('utf8')
    return parsePfx(pfx, password)
}

// O que falta para emitir (mostrado na tela e checado antes do envio).
export function settingsProblems(s: NfseSettings, cert: CertificateInfo | null): string[] {
    const problems: string[] = []
    if (!isValidCnpj(s.cnpj)) problems.push('Informe o CNPJ do prestador.')
    if (!isDigits(s.municipio_ibge, 7)) problems.push('Informe o código IBGE do município emissor.')
    if (!isDigits(s.ctribnac, 6)) problems.push('Informe o código de tributação nacional do serviço (cTribNac).')
    if (s.op_simples === '3' && !isPercent(String(s.ptottribsn), 99.99))
        problems.push('Informe o percentual aproximado dos tributos do Simples Nacional (sua alíquota efetiva).')
    if (!cert) problems.push('Envie o certificado digital A1 (.pfx) da empresa.')
    else {
        if (new Date(cert.notAfter).getTime() < Date.now()) problems.push('O certificado digital está vencido.')
        if (cert.cnpj && s.cnpj && cert.cnpj !== s.cnpj)
            problems.push(`O certificado é do CNPJ ${cert.cnpj}, diferente do CNPJ do prestador configurado.`)
    }
    return problems
}

// Reserva o próximo número da DPS. A trava (SELECT ... FOR UPDATE numa linha de configs) serializa emissões
// simultâneas; a unicidade (ambiente, série, número) em "nfses" garante que nunca se repete.
export async function nextDpsNumber(settings: NfseSettings, transaction: any, NfseModel: any): Promise<number> {
    await Config.findOrCreate({ where: { type: NUMBER_LOCK_KEY }, defaults: { type: NUMBER_LOCK_KEY, value: '', upload: false }, transaction })
    await Config.findOne({ where: { type: NUMBER_LOCK_KEY }, lock: transaction.LOCK.UPDATE, transaction })
    const max = await NfseModel.max('numero_dps', { where: { ambiente: settings.ambiente, serie: settings.serie }, transaction })
    return Math.max(Number(max || 0) + 1, settings.numero_inicial)
}
