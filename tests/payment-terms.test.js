// Condição de pagamento (15/30/60, vencimentos manuais) e baixa de repasse de fornecedor por comissão (parcial / quitar).
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const moment = require('moment')
const { setup, teardown, call, model, controller, load } = require('./helpers')

let M, PC, billingReceipt
const s = {}
const day = (n) => moment().add(n, 'days').format('YYYY-MM-DD')
const ymd = (d) => moment(d).format('YYYY-MM-DD')

before(async () => {
    await setup()
    M = Object.fromEntries(['Client', 'Supplier', 'Product', 'Seller', 'Protocol', 'Billing', 'BillingProtocol', 'ProtocolInstallment', 'Payable', 'BankAccount', 'Protocol_product'].map((n) => [n, model(n)]))
    PC = controller('protocolsController')
    billingReceipt = load('utils/billingReceipt').default
    s.client = await M.Client.create({ name: 'Cliente Parcelas', due_day: 10 })
    s.product = await M.Product.create({ description: 'Licença', value: 900 })
    s.bank = await M.BankAccount.create({ name: 'Banco', balance: 0 })
    s.seller = await M.Seller.create({ name: 'Vend', commission_percent: 10, commission_base: 'liquido', applies_to: 'ambos' })
    s.supplier = await M.Supplier.create({ name: 'Fornecedor 30/60', default_commission_percent: 20, default_payment_terms: '30/60' })
    s.supplier2 = await M.Supplier.create({ name: 'Bitdefender', default_commission_percent: 15 })
})
after(teardown)

const standalone = (body) => call(PC.storeStandalone, { body: { ClientId: s.client.id, products: [{ ProductId: s.product.id, value: 900 }], ...body } })
const billingsOf = async (protocolId) => {
    const bps = await M.BillingProtocol.findAll({ where: { ProtocolId: protocolId }, include: [M.Billing], order: [['id', 'ASC']] })
    return bps.map((bp) => ({ bp, billing: bp.Billing }))
}
const pay = (billing, extra = {}) => call(billingReceipt, { body: { id: billing.id, method: 'Pix', BankAccountId: s.bank.id, ...extra } })

test('15/30/60 gera uma cobrança por vencimento, com valores iguais', async () => {
    const r = await standalone({ payment_terms: '15/30/60' })
    assert.equal(r.code, 201, JSON.stringify(r.body))
    const list = await billingsOf(r.body.id)
    assert.deepEqual(list.map((x) => ymd(x.billing.due_date)), [day(15), day(30), day(60)])
    assert.deepEqual(list.map((x) => x.bp.value), [300, 300, 300])
    assert.ok(list.every((x) => x.billing.fixed_due_date && x.billing.ClientId === s.client.id))
    s.p1 = r.body
    s.p1Billings = list.map((x) => x.billing)
})

test('outro protocolo com vencimento no mesmo dia entra na mesma cobrança; cobrança única não se mistura com parcelas', async () => {
    const r = await standalone({ payment_terms: '15', products: [{ ProductId: s.product.id, value: 100 }] })
    const [x] = await billingsOf(r.body.id)
    assert.equal(x.billing.id, s.p1Billings[0].id)
    await x.billing.reload()
    assert.equal(Number(x.billing.total_value), 400)
    const single = await standalone({ products: [{ ProductId: s.product.id, value: 50 }] })
    const [y] = await billingsOf(single.body.id)
    assert.equal(y.billing.fixed_due_date, false)
    assert.ok(!s.p1Billings.some((b) => b.id === y.billing.id))
})

test('pagar as parcelas uma a uma; o protocolo fecha só na última', async () => {
    const [b1, b2, b3] = s.p1Billings
    assert.equal((await pay(b1)).code, 200)
    assert.equal((await M.Protocol.findByPk(s.p1.id)).status, 'Liberado para pagamento')
    const inst = await M.ProtocolInstallment.findAll({ where: { ProtocolId: s.p1.id }, order: [['number', 'ASC']] })
    assert.deepEqual(inst.map((i) => i.status), ['pago', 'pendente', 'pendente'])
    await pay(b2)
    await pay(b3)
    assert.equal((await M.Protocol.findByPk(s.p1.id)).status, 'Fechado')
})

test('vencimentos manuais: datas e valores informados; soma diferente impede liberar', async () => {
    const p = await M.Protocol.create({ ClientId: s.client.id, status: 'Em aberto' })
    await M.Protocol_product.create({ ProtocolId: p.id, ProductId: s.product.id, value: 1000, charge_type: 'Único' })
    let r = await call(PC.update, { params: { id: p.id }, body: { status: 'Em aberto', installments: [{ due_date: day(10), value: 400 }, { due_date: day(45), value: 500 }] } })
    assert.equal(r.code, 200)
    await assert.rejects(call(PC.update, { params: { id: p.id }, body: { status: 'Liberado para pagamento' } }), /somam 900\.00/)
    r = await call(PC.update, { params: { id: p.id }, body: { status: 'Em aberto', installments: [{ due_date: day(10), value: 400 }, { due_date: day(45), value: 600 }] } })
    r = await call(PC.update, { params: { id: p.id }, body: { status: 'Liberado para pagamento' } })
    assert.equal(r.code, 200)
    const list = await billingsOf(p.id)
    assert.deepEqual(list.map((x) => [ymd(x.billing.due_date), x.bp.value]), [[day(10), 400], [day(45), 600]])
    s.manual = p
})

test('condição não muda depois de liberado; voltar para "Em aberto" desfaz as cobranças das parcelas', async () => {
    let r = await call(PC.update, { params: { id: s.manual.id }, body: { status: 'Liberado para pagamento', installments: [{ due_date: day(5), value: 1000 }] } })
    assert.equal(r.code, 400)
    const before = await billingsOf(s.manual.id)
    r = await call(PC.update, { params: { id: s.manual.id }, body: { status: 'Em aberto' } })
    assert.equal(r.code, 200)
    assert.equal((await billingsOf(s.manual.id)).length, 0)
    for (const x of before) assert.equal(await M.Billing.findByPk(x.billing.id), null, 'cobrança de parcela vazia é removida')
    assert.equal(await M.ProtocolInstallment.count({ where: { ProtocolId: s.manual.id } }), 2, 'vencimentos manuais ficam guardados')
})

test('comissão sem condição própria usa a condição padrão do fornecedor (30/60)', async () => {
    const r = await standalone({ billing_mode: 'Comissão', CommissionSupplierId: s.supplier.id, products: [{ ProductId: s.product.id, value: 1500 }] })
    assert.equal(r.code, 201, JSON.stringify(r.body))
    const list = await billingsOf(r.body.id)
    assert.deepEqual(list.map((x) => [ymd(x.billing.due_date), x.bp.value, x.billing.SupplierId]), [[day(30), 150, s.supplier.id], [day(60), 150, s.supplier.id]])
})

test('repasse parcial: o que falta volta para uma nova cobrança do fornecedor', async () => {
    const r = await standalone({ SellerId: s.seller.id, billing_mode: 'Comissão', CommissionSupplierId: s.supplier2.id, products: [{ ProductId: s.product.id, value: 1000 }] })
    const [x] = await billingsOf(r.body.id)
    assert.equal(x.bp.value, 150)
    const res = await pay(x.billing, { allocations: [{ BillingProtocolId: x.bp.id, value: 100 }] })
    assert.equal(res.code, 200, JSON.stringify(res.body))
    const p = await M.Protocol.findByPk(r.body.id)
    assert.equal(p.status, 'Liberado para pagamento')
    const list = await billingsOf(r.body.id)
    const pending = list.find((y) => y.billing.status === 'pendente')
    assert.equal(pending.bp.value, 50)
    s.partial = { protocol: p, pending }
})

test('quitar com valor menor (ex.: imposto do fornecedor): comissão fixada no total recebido e protocolo fechado', async () => {
    const { pending, protocol } = s.partial
    const res = await pay(pending.billing, { allocations: [{ BillingProtocolId: pending.bp.id, value: 40, settle: true }] })
    assert.equal(res.code, 200, JSON.stringify(res.body))
    await protocol.reload()
    assert.equal(protocol.status, 'Fechado')
    assert.equal(protocol.commission_value, 140)
    assert.equal(protocol.commission_manual, true)
    const payable = await M.Payable.findOne({ where: { ProtocolId: protocol.id } })
    assert.equal(Number(payable.value), 14, 'vendedor recebe sobre a comissão final')
})

test('quitar uma parcela cancela as parcelas seguintes e remove a cobrança delas', async () => {
    const r = await standalone({ billing_mode: 'Comissão', CommissionSupplierId: s.supplier.id, products: [{ ProductId: s.product.id, value: 1500 }] })
    const list = await billingsOf(r.body.id)
    const res = await pay(list[0].billing, { allocations: [{ BillingProtocolId: list[0].bp.id, value: 120, settle: true }] })
    assert.equal(res.code, 200, JSON.stringify(res.body))
    const p = await M.Protocol.findByPk(r.body.id)
    assert.equal(p.status, 'Fechado')
    assert.equal(p.commission_value, 120)
    const inst = await M.ProtocolInstallment.findAll({ where: { ProtocolId: p.id }, order: [['number', 'ASC']] })
    assert.deepEqual(inst.map((i) => i.status), ['pago', 'cancelado'])
    assert.equal(await M.BillingProtocol.count({ where: { ProtocolId: p.id, BillingId: list[1].billing.id } }), 0)
})

test('valor acima do previsto exige quitar; nada informado é recusado', async () => {
    const r = await standalone({ billing_mode: 'Comissão', CommissionSupplierId: s.supplier2.id, products: [{ ProductId: s.product.id, value: 100 }] })
    const [x] = await billingsOf(r.body.id)
    let res = await pay(x.billing, { allocations: [{ BillingProtocolId: x.bp.id, value: 999 }] })
    assert.equal(res.code, 400)
    res = await pay(x.billing, { allocations: [{ BillingProtocolId: x.bp.id, value: 0 }] })
    assert.equal(res.code, 400)
})

test('condição inválida é recusada', async () => {
    assert.equal((await standalone({ payment_terms: '60/30' })).code, 400)
    assert.equal((await standalone({ payment_terms: 'abc' })).code, 400)
})
