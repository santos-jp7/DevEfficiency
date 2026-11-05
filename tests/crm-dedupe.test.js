// Duplicidade: conversão de lead não duplica cliente; cadastro avisa sobre leads/clientes parecidos.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { setup, teardown, call, model, controller } = require('./helpers')

let L, O, Client, Contact, Lead
const s = {}

before(async () => {
    await setup()
    L = controller('crm/leadsController')
    O = controller('crm/opportunitiesController')
    Client = model('Client')
    Contact = model('Contact')
    Lead = model('Lead')
    s.acme = await Client.create({ name: 'ACME', document: '12345678000190', email: 'financeiro@acme.com' })
    s.beta = await Client.create({ name: 'Beta' })
    await Contact.create({ name: 'Ana', email: 'ana@beta.com', ClientId: s.beta.id })
})
after(teardown)

const newLead = async (body) => (await call(L.store, { body })).body
const newOpp = async (LeadId) => (await call(O.store, { body: { title: 'Negócio ' + LeadId, LeadId } })).body

test('check encontra cliente pelo CNPJ (com máscara) e pelo e-mail de contato, e lead pelo telefone', async () => {
    let r = await call(L.check, { query: { document: '12.345.678/0001-90' } })
    assert.deepEqual(r.body.clients.map((c) => [c.name, c.reason]), [['ACME', 'documento']])
    r = await call(L.check, { query: { email: 'ANA@beta.com' } })
    assert.deepEqual(r.body.clients.map((c) => [c.name, c.reason]), [['Beta', 'e-mail']])
    const first = await newLead({ name: 'Carlos', whatsapp: '(11) 98888-7777' })
    r = await call(L.check, { query: { phone: '11988887777' } })
    assert.deepEqual(r.body.leads.map((l) => [l.id, l.reason]), [[first.id, 'telefone']])
    r = await call(L.check, { query: { phone: '11988887777', exclude: first.id } })
    assert.equal(r.body.leads.length, 0)
})

test('ganhar lead com mesmo CNPJ de cliente usa o cliente existente (sem duplicar)', async () => {
    const lead = await newLead({ name: 'João', company: 'ACME Ltda', document: '12.345.678/0001-90' })
    const opp = await newOpp(lead.id)
    const before = await Client.count()
    const r = await call(O.win, { params: { id: opp.id }, body: { mode: 'none' } })
    assert.equal(r.code, 201, JSON.stringify(r.body))
    assert.equal(r.body.ClientId, s.acme.id)
    assert.equal(r.body.created_client, false)
    assert.equal(await Client.count(), before)
    const l = await Lead.findByPk(lead.id)
    assert.equal(l.status, 'Convertido')
    assert.equal(l.ClientId, s.acme.id)
})

test('só e-mail parecido não decide sozinho: sem escolha cria cliente; com escolha usa o escolhido', async () => {
    const a = await newLead({ name: 'Ana', email: 'ana@beta.com' })
    const m = await call(L.matches, { params: { id: a.id } })
    assert.deepEqual(m.body.clients.map((c) => c.name), ['Beta'])
    let r = await call(O.win, { params: { id: (await newOpp(a.id)).id }, body: { mode: 'none' } })
    assert.equal(r.body.created_client, true)

    const b = await newLead({ name: 'Ana 2', email: 'ana@beta.com' })
    r = await call(O.win, { params: { id: (await newOpp(b.id)).id }, body: { mode: 'none', client_choice: s.beta.id } })
    assert.equal(r.body.ClientId, s.beta.id)
    assert.equal(r.body.created_client, false)
})

test('"criar novo" força cliente novo mesmo com CNPJ igual', async () => {
    const lead = await newLead({ name: 'Filial', document: '12345678000190' })
    const r = await call(O.win, { params: { id: (await newOpp(lead.id)).id }, body: { mode: 'none', client_choice: 'new' } })
    assert.equal(r.body.created_client, true)
    assert.notEqual(r.body.ClientId, s.acme.id)
})
