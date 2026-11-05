// Valor real das oportunidades: o total do protocolo ligado (convertida ou vinda de OS) substitui a estimativa.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { setup, teardown, call, model, controller, load } = require('./helpers')

let O, R, M
before(async () => {
    await setup()
    O = controller('crm/opportunitiesController')
    R = controller('crm/crmReportsController')
    M = Object.fromEntries(['Client', 'Protocol', 'Protocol_register'].map((n) => [n, model(n)]))
})
after(teardown)

test('oportunidade vinda de OS acompanha o orçamento; ganha com OS gerada passa a valer o protocolo', async () => {
    const { createServiceOrder } = load('utils/serviceOrderFactory')
    const client = await M.Client.create({ name: 'Cliente Valores' })
    const os = await createServiceOrder({ subject: 'Orçamento', ClientId: client.id, notify_client: false })
    const protocol = await M.Protocol.findOne({ where: { ServiceOrderId: os.id } })
    await M.Protocol_register.create({ ProtocolId: protocol.id, type: 'Despesa', description: 'A', value: 500 })
    const opp = (await call(O.fromServiceOrder, { params: { id: os.id } })).body
    assert.equal(opp.estimated_value, 500)

    // Orçamento mudou depois do envio ao CRM.
    await M.Protocol_register.create({ ProtocolId: protocol.id, type: 'Despesa', description: 'B', value: 300 })
    let r = await call(O.index, { query: { status: 'all', ClientId: client.id } })
    assert.equal(r.body.find((o) => o.id === opp.id).protocol_value, 800)
    r = await call(O.show, { params: { id: opp.id } })
    assert.equal(r.body.protocol_value, 800)

    // Outra oportunidade, estimada em 1.000, ganha gerando OS: sem itens ainda vale a estimativa; com itens, o protocolo.
    const opp2 = (await call(O.store, { body: { title: 'Projeto', ClientId: client.id, estimated_value: 1000 } })).body
    const won = (await call(O.win, { params: { id: opp2.id }, body: { mode: 'os' } })).body
    r = await call(O.show, { params: { id: opp2.id } })
    assert.equal(r.body.protocol_value, null)
    await M.Protocol_register.create({ ProtocolId: won.ProtocolId, type: 'Despesa', description: 'Execução', value: 1200 })

    await call(O.stage, { params: { id: opp.id }, body: { stage: 'Ganho' } })
    const today = new Date().toISOString().slice(0, 10)
    r = await call(R.index, { query: { startDate: today, endDate: today } })
    assert.equal(r.body.period.won, 2)
    assert.equal(r.body.period.won_value, 800 + 1200, 'relatório usa os protocolos, não as estimativas')
})
