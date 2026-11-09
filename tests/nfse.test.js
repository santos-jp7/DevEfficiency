// NFS-e (Emissor Nacional): configuração, certificado, montagem/assinatura da DPS (validada contra o XSD oficial
// v1.01 quando o xmllint está disponível) e o ciclo de emissão contra uma Sefin simulada — autorizada, rejeitada,
// queda de conexão com recuperação pelo Id da DPS e DPS já convertida em nota (E0014).
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const fs = require('fs')
const os = require('os')
const zlib = require('zlib')
const { spawnSync } = require('child_process')
const forge = require('node-forge')
const { SignedXml } = require('xml-crypto')
const { setup, teardown, call, model, controller, load } = require('./helpers')

const CNPJ = '11222333000181'
const XSD = path.join(__dirname, 'fixtures', 'nfse-xsd', 'DPS_v1.01.xsd')
const hasXmllint = spawnSync('xmllint', ['--version']).status === 0

let N, B, Cfg, sefin, uploads, certPem

function makePfx(password, cnpj = CNPJ) {
    const keys = forge.pki.rsa.generateKeyPair(2048)
    const cert = forge.pki.createCertificate()
    cert.publicKey = keys.publicKey
    cert.serialNumber = '0a1b'
    cert.validity.notBefore = new Date(Date.now() - 86400e3)
    cert.validity.notAfter = new Date(Date.now() + 365 * 86400e3)
    const attrs = [{ name: 'commonName', value: `EMPRESA TESTE LTDA:${cnpj}` }]
    cert.setSubject(attrs)
    cert.setIssuer(attrs)
    cert.sign(keys.privateKey, forge.md.sha256.create())
    certPem = forge.pki.certificateToPem(cert)
    const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' })
    return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary')
}

const gunzip = (b64) => zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')
const gzip = (txt) => zlib.gzipSync(Buffer.from(txt, 'utf8')).toString('base64')
const tag = (xml, t) => (xml.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1]

function validateXsd(xml) {
    if (!hasXmllint) return
    const file = path.join(os.tmpdir(), `dps-${process.pid}-${Date.now()}.xml`)
    fs.writeFileSync(file, xml)
    const r = spawnSync('xmllint', ['--noout', '--schema', XSD, file], { encoding: 'utf8' })
    fs.unlinkSync(file)
    assert.equal(r.status, 0, `DPS fora do XSD oficial:\n${r.stderr}`)
}

function verifySignature(xml) {
    const { DOMParser } = require('@xmldom/xmldom')
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    const signature = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0]
    assert.ok(signature, 'DPS sem <Signature>')
    const sig = new SignedXml({ publicCert: certPem })
    sig.loadSignature(signature)
    assert.ok(sig.checkSignature(xml), 'assinatura da DPS não confere')
    assert.ok(!/<ds:|xmlns:ds=/.test(xml), 'a Sefin rejeita prefixo de namespace (E1228)')
}

// Sefin simulada: valida o envio e responde conforme o "modo" de cada chamada.
function fakeNfseXml(dpsXml, numero) {
    const idDps = (dpsXml.match(/<infDPS Id="(DPS\d+)"/) || [])[1]
    const chave = ('3550308' + '2' + '2' + CNPJ + String(numero).padStart(13, '0') + '2611' + '123456789' + '0').slice(0, 50)
    const dps = dpsXml.replace(/^<\?xml[^>]*\?>/, '')
    const xml =
        `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${chave}">` +
        `<xLocEmi>São Paulo</xLocEmi><xLocPrestacao>São Paulo</xLocPrestacao><nNFSe>${numero}</nNFSe><cLocIncid>3550308</cLocIncid><xLocIncid>São Paulo</xLocIncid>` +
        `<xTribNac>Análise e desenvolvimento de sistemas.</xTribNac><verAplic>SefinNac</verAplic><ambGer>2</ambGer><tpEmis>1</tpEmis><cStat>100</cStat>` +
        `<dhProc>2026-11-09T10:00:00-03:00</dhProc><nDFSe>1</nDFSe>` +
        `<emit><CNPJ>${CNPJ}</CNPJ><xNome>EMPRESA TESTE LTDA</xNome><enderNac><xLgr>Rua A</xLgr><nro>1</nro><xBairro>Centro</xBairro><cMun>3550308</cMun><UF>SP</UF><CEP>01001000</CEP></enderNac></emit>` +
        `<valores><vBC>${tag(dpsXml, 'vServ')}</vBC><vLiq>${tag(dpsXml, 'vServ')}</vLiq></valores>${dps}</infNFSe></NFSe>`
    return { idDps, chave, xml }
}

function installSefin() {
    sefin = { calls: [], queue: [], issued: new Map(), numero: 100 }
    load('utils/nfse/sefinClient').setSefinTransport(async (req) => {
        const route = req.url.replace(/^https:\/\/[^/]+\/SefinNacional/, '')
        sefin.calls.push({ method: req.method, route, body: req.body })
        assert.ok(req.pfx && req.pfx.length > 0 && req.passphrase, 'requisição sem o certificado (mTLS)')
        const mode = sefin.queue.shift() || 'ok'

        if (req.method === 'POST' && route === '/nfse') {
            const dps = gunzip(req.body.dpsXmlGZipB64)
            sefin.lastDps = dps
            if (mode === 'network') throw new (load('utils/nfse/sefinClient').SefinNetworkError)('socket hang up')
            if (mode === 'reject')
                return { status: 400, body: { idDPS: 'x', erros: [{ Codigo: 'E0312', Descricao: 'Código de tributação nacional inexistente.' }] } }
            if (mode === 'dup') return { status: 400, body: { erros: [{ codigo: 'E0014', descricao: 'DPS já existe.' }] } }
            validateXsd(dps)
            verifySignature(dps)
            const nf = fakeNfseXml(dps, ++sefin.numero)
            sefin.issued.set(nf.idDps, nf)
            return { status: 201, body: { tipoAmbiente: 2, idDps: nf.idDps, chaveAcesso: nf.chave, nfseXmlGZipB64: gzip(nf.xml), alertas: [] } }
        }
        if (req.method === 'GET' && route.startsWith('/dps/')) {
            const nf = sefin.issued.get(decodeURIComponent(route.slice(5)))
            return nf ? { status: 200, body: { idDps: nf.idDps, chaveAcesso: nf.chave } } : { status: 404, body: { erro: { codigo: 'E404', descricao: 'Não encontrada' } } }
        }
        if (req.method === 'GET' && route.startsWith('/nfse/')) {
            const nf = [...sefin.issued.values()].find((x) => x.chave === route.slice(6))
            return nf ? { status: 200, body: { chaveAcesso: nf.chave, nfseXmlGZipB64: gzip(nf.xml) } } : { status: 404, body: {} }
        }
        return { status: 500, body: 'rota inesperada' }
    })
}

async function newBilling(M, extra = {}) {
    const client = await M.Client.create({
        name: 'Cliente NF',
        corporate_name: 'Cliente NF Ltda',
        document: '11444777000161',
        email: 'financeiro@cliente.com.br',
        due_day: 10,
    })
    await M.Address.create({
        type: 'Cobrança', street_name: 'Av. Paulista', number: 1000, complement: 'cj 12', neighborhood: 'Bela Vista',
        city: 'São Paulo', ibge: '3550308', zip: '01310100', state: 'SP', ClientId: client.id,
    })
    const billing = await M.Billing.create({ ClientId: client.id, total_value: 1500, status: 'pendente', due_date: new Date(), ...extra })
    const protocol = await M.Protocol.create({ ClientId: client.id, status: 'Em aberto' })
    await M.Protocol_register.create({ ProtocolId: protocol.id, description: 'Desenvolvimento do módulo de relatórios', value: 1400, type: 'Serviço' })
    await M.Protocol_register.create({ ProtocolId: protocol.id, description: 'Hospedagem (reembolso)', value: 100, type: 'Despesa' })
    await M.BillingProtocol.create({ BillingId: billing.id, ProtocolId: protocol.id, value: 1500 })
    return { client, billing }
}

const M = {}
before(async () => {
    await setup()
    for (const n of ['Client', 'Address', 'Billing', 'BillingFile', 'BillingProtocol', 'Protocol', 'Protocol_register', 'Nfse', 'Config', 'Supplier'])
        M[n] = model(n)
    N = controller('nfseController')
    B = controller('billingController')
    Cfg = controller('configController')
    uploads = []
    load('providers/CloudFlareR2').default.uploadFile = async (key, body, type) => (uploads.push({ key, size: body.length, type }), `https://files.test/${key}`)
    load('utils/nfse/danfse').pdfRenderer.render = async (html) => Buffer.from(`%PDF-fake ${html.length}`)
    installSefin()
})
after(async () => {
    load('utils/nfse/sefinClient').setSefinTransport(null)
    await teardown()
})

test('configuração e certificado: pendências, validação e segredos protegidos', async () => {
    let r = await call(N.settings)
    assert.ok(r.body.problems.some((p) => /certificado/i.test(p)), 'sem certificado deve aparecer como pendência')
    assert.equal(r.body.settings.ambiente, 'producao_restrita', 'começa no ambiente de testes')

    r = await call(N.saveSettings, { body: { ctribnac: '123', municipio_ibge: '35503' } })
    assert.equal(r.code, 400)

    const pfx = makePfx('senha-certa')
    r = await call(N.uploadCertificate, { body: { pfx: pfx.toString('base64'), password: 'errada' } })
    assert.equal(r.code, 400, 'senha errada é recusada')
    r = await call(N.uploadCertificate, { body: { pfx: 'data:application/x-pkcs12;base64,' + pfx.toString('base64'), password: 'senha-certa' } })
    assert.equal(r.code, 200, JSON.stringify(r.body))
    assert.equal(r.body.certificate.cnpj, CNPJ)

    r = await call(N.saveSettings, {
        body: { cnpj: '11.222.333/0001-81', municipio_ibge: '3550308', ctribnac: '01.01.01', cnbs: '115013000', ptottribsn: '6,00', numero_inicial: 10 },
    })
    assert.equal(r.code, 200, JSON.stringify(r.body))
    assert.deepEqual(r.body.problems, [])
    assert.equal(r.body.settings.ctribnac, '010101')

    // O certificado (criptografado) não aparece nem é alterável pela API genérica de configurações.
    const all = (await call(Cfg.index)).body.map((c) => c.type)
    assert.ok(!all.includes('nfse_cert_pfx') && !all.includes('nfse_cert_pass'))
    const stored = await M.Config.findOne({ where: { type: 'nfse_cert_pass' } })
    assert.ok(stored.value.startsWith('v1:') && !stored.value.includes('senha-certa'), 'senha guardada criptografada')
    r = await call(Cfg.store, { params: { type: 'nfse_cert_pfx' }, body: { value: 'x' } })
    assert.equal(r.code, 400)
    r = await call(Cfg.show, { params: { type: 'nfse_cert_pass' } })
    assert.equal(r.code, 404)
})

test('emissão autorizada: DPS no leiaute oficial, PDF anexado e cobrança faturada', async () => {
    const { billing } = await newBilling(M)
    let r = await call(N.draft, { params: { id: billing.id } })
    assert.equal(r.code, 200)
    assert.deepEqual(r.body.problems, [])
    assert.equal(r.body.defaults.valor, 1500)
    assert.match(r.body.defaults.descricao, /Desenvolvimento do módulo de relatórios/)
    assert.ok(!r.body.defaults.descricao.includes('Hospedagem'), 'despesas não entram na descrição')
    assert.ok(r.body.warnings.some((w) => /despesas/.test(w)), 'avisa das despesas incluídas no valor')
    assert.equal(r.body.tomador.documento, '11444777000161')

    r = await call(N.emit, { params: { id: billing.id }, body: { ...r.body.defaults, info_complementar: 'Pedido 77' }, __user: { user: { id: 1 } } })
    assert.equal(r.code, 201, JSON.stringify(r.body))
    assert.equal(r.body.status, 'autorizada')
    assert.equal(r.body.numero_dps, 10, 'respeita o próximo número configurado')
    assert.equal(r.body.numero_nfse, '101')
    assert.equal(r.body.chave_acesso.length, 50)
    assert.equal(r.body.xml_dps, undefined, 'XML não volta na resposta')

    const dps = sefin.lastDps
    // "DPS" + município (7) + tipo de inscrição 2 = CNPJ (1) + CNPJ (14) + série (5) + número (15)
    assert.match(dps, /<infDPS Id="DPS355030821122233300018100001000000000000010">/)
    assert.equal(tag(dps, 'tpAmb'), '2')
    assert.equal(tag(dps, 'serie'), '00001')
    assert.equal(tag(dps, 'opSimpNac'), '3')
    assert.equal(tag(dps, 'regApTribSN'), '1')
    assert.equal(tag(dps, 'pTotTribSN'), '6.00')
    assert.equal(tag(dps, 'vServ'), '1500.00')
    assert.equal(tag(dps, 'tpRetISSQN'), '1')
    assert.ok(!/<pAliq>/.test(dps), 'ME/EPP sem retenção não informa alíquota (E0625)')
    assert.ok(!/<prest>.*<xNome>.*<\/prest>/.test(dps), 'prestador emitente não informa nome (E0121)')
    assert.equal(tag(dps, 'xInfComp'), 'Pedido 77')
    assert.match(dps, /<toma><CNPJ>11444777000161<\/CNPJ><xNome>Cliente NF Ltda<\/xNome><end><endNac><cMun>3550308<\/cMun><CEP>01310100<\/CEP><\/endNac>/)

    const fresh = await M.Billing.findByPk(billing.id)
    assert.equal(fresh.status, 'faturada')
    const files = await M.BillingFile.findAll({ where: { BillingId: billing.id } })
    assert.equal(files.length, 1)
    assert.equal(files[0].type, 'nota_fiscal')
    assert.equal(uploads.at(-1).type, 'application/pdf')

    // Segunda emissão para a mesma cobrança é bloqueada.
    r = await call(N.emit, { params: { id: billing.id }, body: { valor: 1500, descricao: 'x' } })
    assert.equal(r.code, 400)

    // XML, PDF e o HTML do DANFSe a partir do XML autorizado.
    const nf = await M.Nfse.findOne({ where: { BillingId: billing.id } })
    r = await call(N.xml, { params: { id: nf.id } })
    assert.match(r.body, /<NFSe /)
    r = await call(N.pdf, { params: { id: nf.id } })
    assert.equal(r.code, 200)
    const html = load('utils/nfse/danfse').danfseHtml(nf.xml_nfse, 'producao_restrita')
    assert.match(html, /SEM VALOR FISCAL/)
    assert.match(html, /Cliente NF Ltda/)
    assert.match(html, /11\.444\.777\/0001-61/)
})

test('rejeição guarda os erros da Sefin e o número seguinte não é reaproveitado', async () => {
    const { billing } = await newBilling(M)
    sefin.queue.push('reject')
    let r = await call(N.emit, { params: { id: billing.id }, body: { valor: 1500, descricao: 'Serviço' } })
    assert.equal(r.code, 200)
    assert.equal(r.body.status, 'rejeitada')
    assert.equal(r.body.erros[0].codigo, 'E0312')
    assert.equal((await M.Billing.findByPk(billing.id)).status, 'pendente')

    r = await call(N.emit, { params: { id: billing.id }, body: { valor: 1500, descricao: 'Serviço' } })
    assert.equal(r.body.status, 'autorizada')
    assert.equal(r.body.numero_dps, 12)
})

test('queda de conexão fica "processando"; Verificar consulta a DPS e reenvia a mesma', async () => {
    const { billing } = await newBilling(M)
    sefin.queue.push('network')
    let r = await call(N.emit, { params: { id: billing.id }, body: { valor: 990.5, descricao: 'Suporte mensal' } })
    assert.equal(r.body.status, 'processando')
    assert.equal(r.body.erros[0].codigo, 'REDE')
    const idDps = r.body.id_dps

    // Não pode excluir a cobrança nem emitir outra nota enquanto a primeira não se resolve.
    assert.equal((await call(B.destroy, { params: { id: billing.id } })).code, 400)
    assert.equal((await call(N.emit, { params: { id: billing.id }, body: { valor: 990.5, descricao: 'x' } })).code, 400)

    const before = sefin.calls.length
    r = await call(N.sync, { params: { id: r.body.id } })
    assert.equal(r.body.status, 'autorizada', JSON.stringify(r.body))
    const calls = sefin.calls.slice(before).map((c) => `${c.method} ${c.route.split('/').slice(0, 2).join('/')}`)
    assert.deepEqual(calls, ['GET /dps', 'POST /nfse'])
    assert.match(sefin.lastDps, new RegExp(`Id="${idDps}"`), 'reenviou a mesma DPS')
    assert.equal(tag(sefin.lastDps, 'vServ'), '990.50')
})

test('DPS já convertida em nota (E0014) é recuperada pela consulta', async () => {
    const { billing } = await newBilling(M)
    // Simula: primeira tentativa gerou a nota mas a resposta se perdeu; o reenvio volta E0014.
    sefin.queue.push('network')
    let r = await call(N.emit, { params: { id: billing.id }, body: { valor: 200, descricao: 'Consultoria' } })
    const nf = fakeNfseXml(sefin.lastDps, 555)
    sefin.issued.set(nf.idDps, nf)
    sefin.queue.push('ok') // GET /dps encontra
    r = await call(N.sync, { params: { id: r.body.id } })
    assert.equal(r.body.status, 'autorizada')
    assert.equal(r.body.numero_nfse, '555')

    // E0014 direto no envio também é tratado como "já existe".
    const other = await newBilling(M)
    sefin.queue.push('dup')
    const realPost = sefin.issued.size
    r = await call(N.emit, { params: { id: other.billing.id }, body: { valor: 50, descricao: 'Ajuste' } })
    assert.equal(r.body.status, 'processando', 'sem nota encontrada não marca como autorizada')
    assert.equal(sefin.issued.size, realPost)
})

test('ISS retido exige alíquota configurada e a informa na DPS', async () => {
    const { billing } = await newBilling(M)
    let r = await call(N.emit, { params: { id: billing.id }, body: { valor: 1000, descricao: 'Serviço', iss_retido: true } })
    assert.equal(r.code, 400)
    assert.match(r.body.message, /alíquota/)

    await call(N.saveSettings, { body: { aliquota_iss: '2,5' } })
    r = await call(N.emit, { params: { id: billing.id }, body: { valor: 1000, descricao: 'Serviço', iss_retido: true } })
    assert.equal(r.body.status, 'autorizada', JSON.stringify(r.body))
    assert.equal(tag(sefin.lastDps, 'tpRetISSQN'), '2')
    assert.equal(tag(sefin.lastDps, 'pAliq'), '2.50')
})

test('cliente sem documento válido não emite; cobrança de comissão usa o fornecedor como tomador', async () => {
    const { billing, client } = await newBilling(M)
    await client.update({ document: '123' })
    let r = await call(N.draft, { params: { id: billing.id } })
    assert.ok(r.body.problems.some((p) => /CPF\/CNPJ/.test(p)))
    r = await call(N.emit, { params: { id: billing.id }, body: { valor: 10, descricao: 'x' } })
    assert.equal(r.code, 400)

    const supplier = await M.Supplier.create({ name: 'Fabricante X', cnpj: '11.444.777/0001-61', email: 'nf@fabricante.com' })
    const b = await M.Billing.create({ SupplierId: supplier.id, total_value: 300, status: 'pendente', due_date: new Date() })
    r = await call(N.emit, { params: { id: b.id }, body: { valor: 300, descricao: 'Comissão sobre vendas' } })
    assert.equal(r.body.status, 'autorizada', JSON.stringify(r.body))
    assert.match(sefin.lastDps, /<toma><CNPJ>11444777000161<\/CNPJ><xNome>Fabricante X<\/xNome><email>nf@fabricante.com<\/email><\/toma>/)
})
