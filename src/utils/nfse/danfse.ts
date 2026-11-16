// DANFSe: representação em PDF da NFS-e, gerada localmente a partir do XML autorizado
// (não depende da API de DANFSe do ADN, cuja disponibilidade oscilou em 2026).
import ejs from 'ejs'
import fs from 'fs'
import path from 'path'
import puppeteer from 'puppeteer'
import { parseNfseXml } from './parseNfse'

export const pdfRenderer = {
    // Trocado nos testes (sem Chrome).
    async render(html: string): Promise<Buffer> {
        const browser = await puppeteer.launch({
            headless: 'new',
            executablePath: '/usr/bin/google-chrome',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        })
        try {
            const page = await browser.newPage()
            await page.setContent(html, { waitUntil: 'networkidle0' })
            await page.emulateMediaType('screen')
            return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }))
        } finally {
            await browser.close()
        }
    },
}

const brl = (v: unknown) =>
    v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function formatDoc(doc?: string | null) {
    const d = String(doc || '').replace(/\D/g, '')
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
    return doc || ''
}

function formatDateTime(v?: string | null) {
    if (!v) return '—'
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
    if (!m) return v
    return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}`
}

export function danfseHtml(xmlNfse: string, ambiente: 'producao' | 'producao_restrita'): string {
    const nfse = parseNfseXml(xmlNfse)
    const template = fs.readFileSync(path.resolve('src', 'views', 'danfse.ejs'), 'utf-8')
    return ejs.render(template, {
        nfse,
        homologacao: ambiente !== 'producao',
        brl,
        formatDoc,
        formatDateTime,
        chaveFormatada: nfse.chaveAcesso.replace(/(.{4})/g, '$1 ').trim(),
    })
}

export async function danfsePdf(xmlNfse: string, ambiente: 'producao' | 'producao_restrita'): Promise<Buffer> {
    return pdfRenderer.render(danfseHtml(xmlNfse, ambiente))
}
