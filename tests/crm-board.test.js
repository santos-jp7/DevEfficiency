// Funil paginado no servidor, follow-up junto com a mudança de etapa, oportunidades paradas e responsável (multiusuário).
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { setup, teardown, call, model, controller, load, sentEmails } = require('./helpers')

let O, A, M, db
const s = {}
const as = (user) => ({ __user: { user: { id: user.id, username: user.username } } })

before(async () => {
    db = await setup()
    O = controller('crm/opportunitiesController')
    A = controller('crm/activitiesController')
    M = Object.fromEntries(['User', 'Client', 'Opportunity', 'CrmActivity', 'Config'].map((n) => [n, model(n)]))
    s.ana = await M.User.create({ username: 'ana', password: 'x' })
    s.bia = await M.User.create({ username: 'bia', password: 'x' })
    s.client = await M.Client.create({ name: 'Cliente Funil' })
})
after(teardown)

const newOpp = async (user, body) => (await call(O.store, { ...as(user), body: { ClientId: s.client.id, ...body } })).body

test('responsável e autor vêm do usuário logado; filtro "minhas"', async () => {
    const o = await newOpp(s.ana, { title: 'Da Ana', estimated_value: 100 })
    assert.equal(o.UserId, s.ana.id)
    assert.equal(o.CreatedById, s.ana.id)
    await newOpp(s.bia, { title: 'Da Bia', estimated_value: 200 })
    let r = await call(O.index, { ...as(s.bia), query: { mine: '1' } })
    assert.deepEqual(r.body.map((x) => x.title), ['Da Bia'])
    r = await call(O.index, { query: { UserId: String(s.ana.id) } })
    assert.deepEqual(r.body.map((x) => x.title), ['Da Ana'])
    s.ana1 = o
})

test('mudar de etapa com próximo follow-up cria a atividade (responsável = dono da oportunidade)', async () => {
    const due = new Date(Date.now() + 86400000).toISOString()
    const r = await call(O.stage, { ...as(s.bia), params: { id: s.ana1.id }, body: { stage: 'Qualificado', next_followup: { type: 'Ligação', subject: 'Retornar', due_at: due } } })
    assert.equal(r.code, 200)
    const act = await M.CrmActivity.findOne({ where: { OpportunityId: s.ana1.id } })
    assert.equal(act.subject, 'Retornar')
    assert.equal(act.UserId, s.ana.id, 'responsável é a dona da oportunidade')
    assert.equal(act.CreatedById, s.bia.id, 'autor é quem moveu')
    const bad = await call(O.stage, { params: { id: s.ana1.id }, body: { stage: 'Proposta', next_followup: { subject: '' } } })
    assert.equal(bad.code, 400)
})

test('funil paginado: totais da coluna inteira, só as primeiras oportunidades e "carregar mais"', async () => {
    for (let i = 1; i <= 5; i++) await newOpp(s.ana, { title: `Lote ${i}`, estimated_value: 1000, stage: 'Proposta' })
    let r = await call(O.board, { query: { limit: '2' } })
    const proposta = r.body.columns['Proposta']
    assert.equal(proposta.count, 5)
    assert.equal(proposta.items.length, 2)
    assert.equal(proposta.has_more, true)
    assert.equal(proposta.value, 5000)
    assert.equal(proposta.weighted, 2500)
    r = await call(O.board, { query: { limit: '2', stage: 'Proposta', offset: '4' } })
    assert.equal(r.body.columns['Proposta'].items.length, 1)
    assert.equal(r.body.columns['Proposta'].has_more, false)
    r = await call(O.board, { query: { q: 'Lote 3' } })
    assert.equal(r.body.columns['Proposta'].count, 1)
})

test('oportunidade sem movimento além do limite fica "parada" (funil, follow-ups e e-mail)', async () => {
    await M.Config.update({ value: '3' }, { where: { type: 'crm_stale_days' } })
    const old = await newOpp(s.bia, { title: 'Esquecida', estimated_value: 50 })
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000)
    await db.query('UPDATE opportunities SET createdAt=?, stage_changed_at=? WHERE id=?', { replacements: [tenDaysAgo, tenDaysAgo, old.id] })

    let r = await call(O.board, { query: {} })
    const card = r.body.columns['Novo'].items.find((x) => x.id === old.id)
    assert.equal(card.stale, true)
    assert.ok(card.idle_days >= 10)

    r = await call(A.followups, { query: { range: 'today' } })
    assert.ok(r.body.stale.items.some((x) => x.id === old.id))
    r = await call(A.followups, { ...as(s.ana), query: { range: 'today', mine: '1' } })
    assert.ok(!r.body.stale.items.some((x) => x.id === old.id), 'filtro "minhas" vale para paradas')

    const alert = await load('utils/crmFollowupsAlert').sendCrmFollowupsAlert({ force: true })
    assert.equal(alert.sent, true)
    assert.ok(sentEmails.at(-1).html.includes('Esquecida'))

    // Qualquer atividade nova tira da lista de paradas.
    await call(A.store, { ...as(s.bia), body: { OpportunityId: old.id, type: 'Nota', subject: 'Falei com o cliente', done: true } })
    r = await call(O.board, { query: {} })
    assert.equal(r.body.columns['Novo'].items.find((x) => x.id === old.id).stale, false)
})
