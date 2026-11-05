// Protocolos por comissão: o fornecedor cobra o cliente; a cobrança gerada é a da comissão, contra o fornecedor.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { setup, teardown, call, model, controller, load } = require('./helpers')

let M, PC, billingReceipt, Dre
const s = {}

before(async () => {
    await setup()
    M = Object.fromEntries(['Client', 'Supplier', 'Product', 'Seller', 'Protocol', 'Billing', 'BillingProtocol', 'Payable', 'Subscription', 'Protocol_product', 'BankAccount'].map((n) => [n, model(n)]))
    PC = controller('protocolsController')
    billingReceipt = load('utils/billingReceipt').default
    Dre = controller('dreReportController')
    s.client = await M.Client.create({ name: 'Cliente Teste', due_day: 10 })
    s.supplier = await M.Supplier.create({ name: 'Microsoft', default_commission_percent: 15, commission_payment_days: 10 })
    s.product = await M.Product.create({ description: 'M365', value: 1000 })
    s.seller = await M.Seller.create({ name: 'Vendedor', commission_percent: 10, commission_base: 'liquido', applies_to: 'ambos' })
    s.bank = await M.BankAccount.create({ name: 'Banco', balance: 0 })
})
after(teardown)

const standalone = (body) => call(PC.storeStandalone, { body: { ClientId: s.client.id, products: [{ ProductId: s.product.id, value: 1000 }], ...body } })

test('avulso por comissão com valor informado na mão gera cobrança ao fornecedor', async () => {
    const r = await standalone({ SellerId: s.seller.id, billing_mode: 'Comissão', CommissionSupplierId: s.supplier.id, commission_value: 132.4 })
    assert.equal(r.code, 201)
    assert.equal(r.body.commission.value, 132.4)
    assert.equal(r.body.commission.manual, true)
    const billing = await M.Billing.findByPk(r.body.BillingId)
    assert.equal(billing.SupplierId, s.supplier.id)
    assert.equal(billing.ClientId, null)
    assert.equal(Number(billing.total_value), 132.4)
    assert.equal(await M.Billing.count({ where: { ClientId: s.client.id } }), 0, 'cliente não recebe cobrança')
    const days = Math.round((new Date(billing.due_date) - Date.now()) / 86400000)
    assert.ok(days >= 9 && days <= 10, 'vence no prazo do fornecedor')
    s.p1 = r.body
    s.billing = billing
})

test('comissão sugerida pela % do fornecedor entra na mesma cobrança pendente', async () => {
    const r = await standalone({ billing_mode: 'Comissão', CommissionSupplierId: s.supplier.id, commission_value: '' })
    assert.equal(r.code, 201)
    assert.equal(r.body.commission.value, 150)
    assert.equal(r.body.commission.percent, 15)
    assert.equal(r.body.BillingId, s.billing.id)
    await s.billing.reload()
    assert.equal(Number(s.billing.total_value), 282.4)
    s.p2 = r.body
})

test('comissão não pode ser alterada depois de liberado (mesmo valor reenviado passa)', async () => {
    let r = await call(PC.update, { params: { id: s.p1.id }, body: { status: 'Liberado para pagamento', commission_value: 200 } })
    assert.equal(r.code, 400)
    r = await call(PC.update, {
        params: { id: s.p1.id },
        body: { status: 'Liberado para pagamento', billing_mode: 'Comissão', CommissionSupplierId: s.supplier.id, commission_percent: 15, commission_value: 132.4 },
    })
    assert.equal(r.code, 200)
})

test('comissão sem fornecedor é recusada', async () => {
    const r = await standalone({ billing_mode: 'Comissão' })
    assert.equal(r.code, 400)
})

test('baixa da cobrança do fornecedor fecha os protocolos e gera comissão do vendedor sobre a comissão', async () => {
    const r = await call(billingReceipt, { body: { id: s.billing.id, method: 'Pix', BankAccountId: s.bank.id } })
    assert.equal(r.code, 200, JSON.stringify(r.body))
    assert.equal((await M.Protocol.findByPk(s.p1.id)).status, 'Fechado')
    assert.equal((await M.Protocol.findByPk(s.p2.id)).status, 'Fechado')
    const payable = await M.Payable.findOne({ where: { ProtocolId: s.p1.id } })
    assert.equal(Number(payable.value), 13.24)
})

test('protocolo direto continua cobrando o cliente', async () => {
    const r = await standalone({ products: [{ ProductId: s.product.id, value: 500 }] })
    const billing = await M.Billing.findByPk(r.body.BillingId)
    assert.equal(billing.ClientId, s.client.id)
    assert.equal(billing.SupplierId, null)
    assert.equal(Number(billing.total_value), 500)
})

test('assinatura por comissão: cobra o fornecedor e a renovação herda a comissão', async () => {
    const sub = await M.Subscription.create({ ClientId: s.client.id, dueAt: new Date(Date.now() + 60 * 86400000), status: 'Pendente' })
    const sp = await M.Protocol.create({ SubscriptionId: sub.id, status: 'Em aberto' })
    await M.Protocol_product.create({ ProtocolId: sp.id, ProductId: s.product.id, value: 200, charge_type: 'Mensal' })
    let r = await call(PC.update, { params: { id: sp.id }, body: { status: 'Em aberto', billing_mode: 'Comissão', CommissionSupplierId: s.supplier.id, commission_percent: '', commission_value: '' } })
    await sp.reload()
    assert.equal(sp.commission_percent, 15)
    assert.equal(sp.commission_value, 30)
    await call(PC.update, { params: { id: sp.id }, body: { status: 'Liberado para pagamento' } })
    const bp = await M.BillingProtocol.findOne({ where: { ProtocolId: sp.id } })
    const billing = await M.Billing.findByPk(bp.BillingId)
    assert.equal(billing.SupplierId, s.supplier.id)
    assert.equal(bp.value, 30)
    r = await call(billingReceipt, { body: { id: billing.id, method: 'Pix', BankAccountId: s.bank.id } })
    await sp.reload()
    assert.equal(sp.status, 'Fechado')
    const renewal = await M.Protocol.findOne({ where: { SubscriptionId: sub.id, status: 'Em aberto' } })
    assert.equal(renewal.billing_mode, 'Comissão')
    assert.equal(renewal.CommissionSupplierId, s.supplier.id)
    assert.equal(renewal.commission_value, 30)
})

test('DRE conta só a comissão como receita', async () => {
    const now = new Date()
    const r = await call(Dre.index, { query: { month: String(now.getMonth() + 1), year: String(now.getFullYear()) } })
    assert.equal(r.body.grossRevenue, 132.4 + 150 + 30)
})
