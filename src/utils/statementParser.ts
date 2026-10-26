import crypto from 'crypto'

export type ParsedEntry = {
    date: string // YYYY-MM-DD
    amount: number // com sinal: entrada > 0, saída < 0
    description: string
    external_id: string | null
    dedupe_key: string
}

export type ParsedStatement = {
    format: 'ofx' | 'csv'
    entries: ParsedEntry[]
    // Saldo final do extrato (OFX LEDGERBAL), quando informado pelo banco.
    balance?: { amount: number; date: string } | null
}

export class StatementError extends Error {}

const sha1 = (text: string) => crypto.createHash('sha1').update(text).digest('hex')

export const fileHash = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

const normalize = (text: string) =>
    text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// Aceita "1.234,56", "1234,56", "1,234.56", "1234.56", "-R$ 10,00", "(10,00)" e sufixo "D"/"C".
export function parseAmount(raw: string): number {
    let text = String(raw ?? '').trim()
    if (!text) return NaN

    let negative = false
    if (/^\(.*\)$/.test(text)) {
        negative = true
        text = text.slice(1, -1)
    }
    if (/\bD$/i.test(text)) negative = true
    text = text.replace(/\s*[DC]$/i, '')
    if (text.includes('-')) negative = true

    text = text.replace(/[^\d.,]/g, '')
    if (!text) return NaN

    const lastComma = text.lastIndexOf(',')
    const lastDot = text.lastIndexOf('.')

    if (lastComma !== -1 && lastDot !== -1) {
        // O último separador é o decimal.
        if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.')
        else text = text.replace(/,/g, '')
    } else if (lastComma !== -1) {
        text = text.replace(',', '.')
    } else if (lastDot !== -1) {
        // "1.234" (milhar) vs "12.34" (decimal): três dígitos após o único ponto => milhar.
        const parts = text.split('.')
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== '0'))
            text = parts.join('')
    }

    const value = Number(text)
    if (!Number.isFinite(value)) return NaN

    return round2(negative ? -Math.abs(value) : Math.abs(value))
}

// YYYYMMDD[HHMMSS...] (OFX), DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM/YY
export function parseDate(raw: string): string | null {
    const text = String(raw ?? '').trim()
    // OFX: 8 dígitos seguidos no início (pode vir com hora e fuso, ex.: 20251015120000[-3:BRT]).
    let m = text.match(/^(\d{4})(\d{2})(\d{2})/)
    if (m) return validDate(m[1], m[2], m[3])

    m = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return validDate(m[1], m[2], m[3])

    m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
    if (m) return validDate(m[3], m[2], m[1])

    m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})\b/)
    if (m) return validDate(`20${m[3]}`, m[2], m[1])

    return null
}

function validDate(y: string, mo: string, d: string): string | null {
    const year = Number(y)
    const month = Number(mo)
    const day = Number(d)
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Lançamentos sem ID do banco: a chave usa data+valor+descrição e um contador de ocorrência, para que dois
// lançamentos legitimamente idênticos no mesmo arquivo não sejam tratados como duplicados entre si, mas a
// reimportação do mesmo arquivo (ou de um extrato sobreposto) gere exatamente as mesmas chaves.
function assignKeys(rows: Omit<ParsedEntry, 'dedupe_key'>[]): ParsedEntry[] {
    const seen = new Map<string, number>()

    return rows.map((row) => {
        const base = row.external_id
            ? `id|${row.external_id}|${row.date}|${row.amount.toFixed(2)}`
            : `tx|${row.date}|${row.amount.toFixed(2)}|${normalize(row.description)}`

        const occurrence = (seen.get(base) || 0) + 1
        seen.set(base, occurrence)

        return { ...row, dedupe_key: sha1(`${base}|${occurrence}`) }
    })
}

export function decodeBuffer(buffer: Buffer): string {
    let text = buffer.toString('utf8')
    // Arquivos antigos de bancos brasileiros costumam vir em windows-1252.
    if (text.includes('�') || /CHARSET:\s*1252/i.test(text.slice(0, 600))) text = buffer.toString('latin1')
    return text.replace(/^﻿/, '')
}

// ───────────────────────── OFX ─────────────────────────

function ofxTag(block: string, tag: string): string | null {
    const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))
    return m ? m[1].trim() : null
}

function decodeEntities(text: string) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
}

export function parseOfx(text: string): ParsedEntry[] {
    const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi) || []
    if (blocks.length === 0) throw new StatementError('Nenhuma transação encontrada no arquivo OFX.')

    const rows: Omit<ParsedEntry, 'dedupe_key'>[] = []

    for (const block of blocks) {
        const date = parseDate(ofxTag(block, 'DTPOSTED') || '')
        const amount = parseAmount(ofxTag(block, 'TRNAMT') || '')

        if (!date || Number.isNaN(amount)) throw new StatementError('Transação OFX inválida (data ou valor ausente).')

        const memo = ofxTag(block, 'MEMO')
        const name = ofxTag(block, 'NAME')
        const description = decodeEntities([name, memo && memo !== name ? memo : null].filter(Boolean).join(' - '))
        const fitid = ofxTag(block, 'FITID')

        rows.push({ date, amount, description, external_id: fitid || null })
    }

    return assignKeys(rows)
}

export function parseOfxBalance(text: string): { amount: number; date: string } | null {
    const block = text.match(/<LEDGERBAL>[\s\S]*?(?=<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|$)/i)?.[0]
    if (!block) return null

    const amount = parseAmount(ofxTag(block, 'BALAMT') || '')
    const date = parseDate(ofxTag(block, 'DTASOF') || '')

    return Number.isNaN(amount) || !date ? null : { amount, date }
}

// ───────────────────────── CSV ─────────────────────────

// Escolhe o separador que divide as primeiras linhas num número estável de colunas (bancos costumam colocar
// linhas de resumo antes do cabeçalho, então não dá para olhar só a primeira linha).
function detectDelimiter(text: string): string {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 30)

    let best = ','
    let bestScore = 0

    for (const candidate of [';', '\t', ',', '|']) {
        const frequency = new Map<number, number>()
        for (const line of lines) {
            const fields = line.split(candidate).length
            if (fields > 1) frequency.set(fields, (frequency.get(fields) || 0) + 1)
        }

        // Quantas linhas compartilham a contagem de colunas mais comum.
        const score = Math.max(0, ...frequency.values())
        if (score > bestScore) {
            best = candidate
            bestScore = score
        }
    }

    return best
}

function parseCsvLines(text: string, delimiter: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let field = ''
    let quoted = false

    for (let i = 0; i < text.length; i++) {
        const ch = text[i]

        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') {
                field += '"'
                i++
            } else if (ch === '"') quoted = false
            else field += ch
            continue
        }

        if (ch === '"') quoted = true
        else if (ch === delimiter) {
            row.push(field)
            field = ''
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++
            row.push(field)
            field = ''
            if (row.some((c) => c.trim() !== '')) rows.push(row)
            row = []
        } else field += ch
    }

    row.push(field)
    if (row.some((c) => c.trim() !== '')) rows.push(row)

    return rows
}

const HEADER_ALIASES = {
    date: ['data', 'date', 'dt', 'data lancamento', 'data movimento', 'data da transacao', 'data transacao', 'dt lancamento'],
    description: ['descricao', 'historico', 'lancamento', 'memo', 'description', 'detalhes', 'estabelecimento', 'descricao do lancamento'],
    amount: ['valor', 'amount', 'valor (r$)', 'valor r$', 'montante', 'value'],
    credit: ['credito', 'credito (r$)', 'entrada', 'entradas', 'credit'],
    debit: ['debito', 'debito (r$)', 'saida', 'saidas', 'debit'],
    id: ['id', 'identificador', 'documento', 'numero documento', 'nr documento', 'n documento', 'fitid', 'codigo', 'protocolo'],
}

function findColumn(headers: string[], aliases: string[]): number {
    const norm = headers.map(normalize)
    const exact = norm.findIndex((h) => aliases.includes(h))
    if (exact !== -1) return exact
    return norm.findIndex((h) => aliases.some((a) => h.startsWith(a)))
}

export function parseCsv(text: string): ParsedEntry[] {
    if (!text.trim()) throw new StatementError('Arquivo CSV vazio.')

    const delimiter = detectDelimiter(text)
    const lines = parseCsvLines(text, delimiter)

    // Alguns bancos colocam linhas de resumo antes do cabeçalho: procura a primeira linha com data + valor.
    let headerIndex = -1
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
        const dateCol = findColumn(lines[i], HEADER_ALIASES.date)
        const valueCol = Math.max(
            findColumn(lines[i], HEADER_ALIASES.amount),
            findColumn(lines[i], HEADER_ALIASES.credit),
            findColumn(lines[i], HEADER_ALIASES.debit),
        )
        if (dateCol !== -1 && valueCol !== -1) {
            headerIndex = i
            break
        }
    }

    if (headerIndex === -1)
        throw new StatementError(
            'Não foi possível identificar as colunas do CSV. O cabeçalho precisa ter data e valor (ou crédito/débito).',
        )

    const header = lines[headerIndex]
    const col = {
        date: findColumn(header, HEADER_ALIASES.date),
        description: findColumn(header, HEADER_ALIASES.description),
        amount: findColumn(header, HEADER_ALIASES.amount),
        credit: findColumn(header, HEADER_ALIASES.credit),
        debit: findColumn(header, HEADER_ALIASES.debit),
        id: findColumn(header, HEADER_ALIASES.id),
    }

    const rows: Omit<ParsedEntry, 'dedupe_key'>[] = []

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const cells = lines[i]
        const date = parseDate(cells[col.date] || '')

        // Linhas de saldo/total sem data válida são ignoradas.
        if (!date) continue

        let amount = NaN
        if (col.amount !== -1) amount = parseAmount(cells[col.amount] || '')

        if (Number.isNaN(amount)) {
            const credit = col.credit !== -1 ? parseAmount(cells[col.credit] || '') : NaN
            const debit = col.debit !== -1 ? parseAmount(cells[col.debit] || '') : NaN
            if (!Number.isNaN(credit) && credit !== 0) amount = Math.abs(credit)
            else if (!Number.isNaN(debit) && debit !== 0) amount = -Math.abs(debit)
        }

        if (Number.isNaN(amount) || amount === 0) continue

        const description = col.description !== -1 ? (cells[col.description] || '').trim() : ''
        const external = col.id !== -1 ? (cells[col.id] || '').trim() : ''

        rows.push({ date, amount, description, external_id: external || null })
    }

    if (rows.length === 0) throw new StatementError('Nenhum lançamento válido encontrado no CSV.')

    return assignKeys(rows)
}

export function parseStatement(buffer: Buffer, filename: string): ParsedStatement {
    const text = decodeBuffer(buffer)
    const isOfx = /\.ofx$/i.test(filename) || /<OFX>|OFXHEADER/i.test(text.slice(0, 2000))

    if (isOfx) return { format: 'ofx', entries: parseOfx(text), balance: parseOfxBalance(text) }
    if (/\.(csv|txt)$/i.test(filename)) return { format: 'csv', entries: parseCsv(text) }

    throw new StatementError('Formato não suportado. Envie um arquivo .ofx ou .csv.')
}
