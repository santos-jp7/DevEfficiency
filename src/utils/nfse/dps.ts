// Montagem do XML da DPS (Declaração de Prestação de Serviço) da NFS-e Padrão Nacional, leiaute v1.01.
// A ordem dos elementos segue exatamente o XSD oficial (DPS_v1.01.xsd / tiposComplexos_v1.01.xsd): a Sefin Nacional
// rejeita (E1235) qualquer DPS fora do esquema. Sem prefixo de namespace (E1228) e em UTF-8 (E1229).

export const NFSE_NAMESPACE = 'http://www.sped.fazenda.gov.br/nfse'
export const DPS_VERSION = '1.01'
export const APP_VERSION = 'DevEfficiency-1.0'

export type Ambiente = 'producao' | 'producao_restrita'

// Tomador no exterior: identificado pelo NIF (ou motivo de não ter NIF) e com endereço no exterior.
export interface DpsExterior {
    nif?: string | null
    cNaoNIF?: '0' | '1' | '2' | null // 1 = dispensado do NIF · 2 = não exigência do NIF
    cPais: string // ISO 3166-1 alfa-2, ex.: US
    cEndPost: string
    xCidade: string
    xEstProvReg: string
    logradouro: string
    numero: string
    complemento?: string | null
    bairro?: string | null
}

export interface DpsPessoa {
    documento: string // CPF (11) ou CNPJ (14), só dígitos — vazio quando o tomador é do exterior
    nome: string
    im?: string | null
    email?: string | null
    exterior?: DpsExterior | null
    endereco?: {
        cMun: string // IBGE, 7 dígitos
        cep: string // 8 dígitos
        logradouro: string
        numero: string
        complemento?: string | null
        bairro: string
    } | null
}

export interface DpsInput {
    ambiente: Ambiente
    dhEmi: Date
    serie: string
    numero: number
    competencia: string // AAAA-MM-DD
    cLocEmi: string // município emissor (IBGE)
    // Substituição: a nova NFS-e cancela a original (evento gerado pela própria Sefin).
    subst?: { chave: string; cMotivo: string; xMotivo?: string | null } | null
    prestador: {
        cnpj: string
        im?: string | null
        opSimpNac: '1' | '2' | '3'
        regApTribSN?: '1' | '2' | '3' | null
        regEspTrib: string
    }
    tomador: DpsPessoa
    servico: {
        cLocPrestacao: string
        cTribNac: string
        cTribMun?: string | null
        descricao: string
        cNBS?: string | null
        infoComplementar?: string | null
        // Exportação de serviço (obrigatório quando o tomador é do exterior — regra E0330).
        comExt?: {
            mdPrestacao: string
            vincPrest: string
            tpMoeda: string // código BACEN (220 USD, 978 EUR, 540 GBP)
            vServMoeda: number
            mecAFComexP: string
            mecAFComexT: string
            movTempBens: string
            mdic: string
        } | null
    }
    valores: {
        vServ: number
        tpRetISSQN: '1' | '2' | '3'
        pAliq?: number | null // só quando há retenção do ISSQN (regras E0621/E0625 para ME/EPP)
        pTotTribSN?: number | null // ME/EPP: percentual aproximado dos tributos do Simples
        tribISSQN?: '1' | '3' // 1 = operação tributável · 3 = exportação de serviço
        cPaisResult?: string | null // país onde se verificou o resultado (exportação)
    }
    // Reforma tributária: grupo IBS/CBS declarado pelo emitente (opcional até a obrigatoriedade).
    ibscbs?: { cIndOp: string; indFinal?: '0' | '1' | null; cst: string; cClassTrib: string } | null
}

const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

export function escapeXml(value: unknown): string {
    return String(value ?? '')
        // Caracteres de controle (exceto quebra de linha) não são aceitos no XML.
        .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F]/g, ' ')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

// Valores monetários/percentuais: ponto decimal e sempre 2 casas (TSDec15V2, TSDec2V2, TSDec1V2).
export function dec(value: number): string {
    const n = Math.round((Number(value) || 0) * 100) / 100
    return n.toFixed(2)
}

// Data e hora no fuso de Brasília com offset explícito (TSDateTimeUTC: AAAA-MM-DDThh:mm:ss-03:00).
export function formatDateTimeBR(d: Date): string {
    const brt = new Date(d.getTime() - 3 * 3600 * 1000)
    return `${brt.toISOString().slice(0, 19)}-03:00`
}

export function todayBR(d: Date = new Date()): string {
    return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10)
}

// "DPS" + cód. município (7) + tipo de inscrição (1 = CPF, 2 = CNPJ) + inscrição (14) + série (5) + número (15).
export function buildDpsId(cLocEmi: string, cnpjOrCpf: string, serie: string | number, numero: number): string {
    const doc = onlyDigits(cnpjOrCpf)
    const tipo = doc.length === 11 ? '1' : '2'
    return (
        'DPS' +
        onlyDigits(cLocEmi).padStart(7, '0') +
        tipo +
        doc.padStart(14, '0') +
        onlyDigits(serie).padStart(5, '0') +
        String(numero).padStart(15, '0')
    )
}

const el = (tag: string, value: unknown) => `<${tag}>${escapeXml(value)}</${tag}>`
const opt = (tag: string, value: unknown) => (value === undefined || value === null || value === '' ? '' : el(tag, value))

function docTag(documento: string): string {
    const doc = onlyDigits(documento)
    return doc.length === 11 ? el('CPF', doc) : el('CNPJ', doc)
}

function pessoa(tag: string, p: DpsPessoa): string {
    const x = p.exterior
    if (x) {
        const id = x.nif ? el('NIF', x.nif) : el('cNaoNIF', x.cNaoNIF || '2')
        const end =
            '<end>' +
            `<endExt>${el('cPais', x.cPais)}${el('cEndPost', x.cEndPost)}${el('xCidade', x.xCidade)}${el('xEstProvReg', x.xEstProvReg)}</endExt>` +
            el('xLgr', x.logradouro) +
            el('nro', x.numero || 'S/N') +
            opt('xCpl', x.complemento) +
            el('xBairro', x.bairro || 'N/A') +
            '</end>'
        return `<${tag}>${id}${el('xNome', p.nome)}${end}${opt('email', p.email)}</${tag}>`
    }
    const e = p.endereco
    const end = e
        ? '<end>' +
          `<endNac>${el('cMun', onlyDigits(e.cMun))}${el('CEP', onlyDigits(e.cep))}</endNac>` +
          el('xLgr', e.logradouro) +
          el('nro', e.numero) +
          opt('xCpl', e.complemento) +
          el('xBairro', e.bairro) +
          '</end>'
        : ''
    return (
        `<${tag}>` +
        docTag(p.documento) +
        opt('IM', p.im) +
        el('xNome', p.nome) +
        end +
        opt('email', p.email) +
        `</${tag}>`
    )
}

// XML da DPS ainda sem assinatura. A assinatura (XMLDSig) é adicionada depois como último filho de <DPS>.
export function buildDpsXml(input: DpsInput): string {
    const p = input.prestador
    const s = input.servico
    const v = input.valores
    const id = buildDpsId(input.cLocEmi, p.cnpj, input.serie, input.numero)

    // Prestador emitente (tpEmit = 1): sem xNome (E0121) e sem endereço (E0128) — a Sefin usa o cadastro CNPJ.
    // regApTribSN só existe para ME/EPP (E0162/E0166).
    const prest =
        '<prest>' +
        el('CNPJ', onlyDigits(p.cnpj)) +
        opt('IM', p.im) +
        '<regTrib>' +
        el('opSimpNac', p.opSimpNac) +
        (p.opSimpNac === '3' ? el('regApTribSN', p.regApTribSN || '1') : '') +
        el('regEspTrib', p.regEspTrib || '0') +
        '</regTrib>' +
        '</prest>'

    const infoCompl = s.infoComplementar ? `<infoCompl>${el('xInfComp', s.infoComplementar)}</infoCompl>` : ''
    const c = s.comExt
    const comExt = c
        ? '<comExt>' +
          el('mdPrestacao', c.mdPrestacao) +
          el('vincPrest', c.vincPrest) +
          el('tpMoeda', c.tpMoeda) +
          el('vServMoeda', dec(c.vServMoeda)) +
          el('mecAFComexP', c.mecAFComexP) +
          el('mecAFComexT', c.mecAFComexT) +
          el('movTempBens', c.movTempBens) +
          el('mdic', c.mdic) +
          '</comExt>'
        : ''

    const serv =
        '<serv>' +
        `<locPrest>${el('cLocPrestacao', onlyDigits(s.cLocPrestacao))}</locPrest>` +
        '<cServ>' +
        el('cTribNac', onlyDigits(s.cTribNac)) +
        opt('cTribMun', s.cTribMun ? onlyDigits(s.cTribMun) : null) +
        el('xDescServ', s.descricao) +
        opt('cNBS', s.cNBS ? onlyDigits(s.cNBS) : null) +
        '</cServ>' +
        comExt +
        infoCompl +
        '</serv>'

    // Totais aproximados de tributos: ME/EPP informa o percentual do Simples (pTotTribSN; indTotTrib é proibido, E0712);
    // MEI informa indTotTrib = 0 (pTotTribSN é proibido, E0710).
    const totTrib =
        p.opSimpNac === '3'
            ? `<totTrib>${el('pTotTribSN', dec(v.pTotTribSN || 0))}</totTrib>`
            : '<totTrib><indTotTrib>0</indTotTrib></totTrib>'

    const tribMun =
        '<tribMun>' +
        el('tribISSQN', v.tribISSQN || '1') +
        opt('cPaisResult', v.cPaisResult) +
        el('tpRetISSQN', v.tpRetISSQN) +
        (v.pAliq !== undefined && v.pAliq !== null ? el('pAliq', dec(v.pAliq)) : '') +
        '</tribMun>'

    const valores =
        '<valores>' +
        `<vServPrest>${el('vServ', dec(v.vServ))}</vServPrest>` +
        `<trib>${tribMun}${totTrib}</trib>` +
        '</valores>'

    const subst = input.subst
        ? '<subst>' + el('chSubstda', input.subst.chave) + el('cMotivo', input.subst.cMotivo) + opt('xMotivo', input.subst.xMotivo) + '</subst>'
        : ''

    // IBS/CBS: finalidade 0 (NFS-e regular), destinatário = tomador (indDest 0), tributação pela classificação informada.
    const g = input.ibscbs
    const ibscbs = g
        ? '<IBSCBS>' +
          el('finNFSe', '0') +
          opt('indFinal', g.indFinal) +
          el('cIndOp', g.cIndOp) +
          el('indDest', '0') +
          `<valores><trib><gIBSCBS>${el('CST', g.cst)}${el('cClassTrib', g.cClassTrib)}</gIBSCBS></trib></valores>` +
          '</IBSCBS>'
        : ''

    return (
        '<?xml version="1.0" encoding="UTF-8"?>' +
        `<DPS xmlns="${NFSE_NAMESPACE}" versao="${DPS_VERSION}">` +
        `<infDPS Id="${id}">` +
        el('tpAmb', input.ambiente === 'producao' ? '1' : '2') +
        el('dhEmi', formatDateTimeBR(input.dhEmi)) +
        el('verAplic', APP_VERSION) +
        el('serie', onlyDigits(input.serie).padStart(5, '0')) +
        el('nDPS', String(input.numero)) +
        el('dCompet', input.competencia) +
        el('tpEmit', '1') +
        el('cLocEmi', onlyDigits(input.cLocEmi)) +
        subst +
        prest +
        pessoa('toma', input.tomador) +
        serv +
        valores +
        ibscbs +
        '</infDPS>' +
        '</DPS>'
    )
}

export function isValidCnpj(value: string): boolean {
    const c = onlyDigits(value)
    if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
    const calc = (len: number) => {
        let sum = 0
        let pos = len - 7
        for (let i = 0; i < len; i++) {
            sum += Number(c[i]) * pos--
            if (pos < 2) pos = 9
        }
        const r = sum % 11
        return r < 2 ? 0 : 11 - r
    }
    return calc(12) === Number(c[12]) && calc(13) === Number(c[13])
}

export function isValidCpf(value: string): boolean {
    const c = onlyDigits(value)
    if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
    const calc = (len: number) => {
        let sum = 0
        for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i)
        const r = (sum * 10) % 11
        return r === 10 ? 0 : r
    }
    return calc(9) === Number(c[9]) && calc(10) === Number(c[10])
}

export { onlyDigits }
