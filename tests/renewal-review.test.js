// Renovação de assinatura por comissão: anual com comissão na mão pede revisão antes de cobrar; mensal repete o valor.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { setup, teardown, call, model, controller, load } = require('./helpers')

let M, PC, billingReceipt
const s = {}

before(async () => {
    await setup()
    M = Object.fromEntries(['Client', 'Supplier', 'Product', 'Protocol', 'Protocol_product', 'Subscription', 'BillingProtocol', 'Billing', 'BankAccount', 'Config'].map((n) => [n, model(n)]))
    PC = controller('protocolsController')
    billingReceipt = load('utils/billingReceipt').default
    // Janela grande: a renovação já nasce dentro dela (libera na hora quando pode).
    await M.Config.update({ value: '400' }, { where: { type: 'subscription_release_days' } })
    s.client = await M.Client.create({ name: 'Cliente Licenças' })
    s.supplier = await M.Supplier.create({ name: 'Bitdefender' })
    s.bank = await M.BankAccount.create({ name: 'Banco', balance: 0 })
    s.product = await M.Product.create({ description: 'GravityZone', value: 1000 })
})
after(teardown)

// Assinatura com 1 produto (Anual/Mensal), comissão na mão, liberada e paga → gera a renovação.
async function cycle(chargeType, commission) {
    const sub = await M.Subscription.create({ ClientId: s.client.id, dueAt: new Date(Date.now() + 20 * 86400000), status: 'Pendente' })
    const p = await M.Protocol.create({ SubscriptionId: sub.id, status: 'Em aberto' })
    await M.Protocol_product.create({ ProtocolId: p.id, ProductId: s.product.id, value: 1000, charge_type: chargeType })
    await call(PC.update, { params: { id: p.id }, body: { status: 'Liberado para pagamento', billing_mode: 'Comissão', CommissionSupplierId: s.supplier.id, commission_value: commission } })
    const bp = await M.BillingProtocol.findOne({ where: { ProtocolId: p.id } })
    const r = await call(billingReceipt, { body: { id: bp.BillingId, method: 'Pix', BankAccountId: s.bank.id } })
    assert.equal(r.code, 200, JSON.stringify(r.body))
    return M.Protocol.findOne({ where: { SubscriptionId: sub.id, id: { [require('sequelize').Op.ne]: p.id } } })
}

test('anual com comissão na mão: renovação fica em aberto, marcada para revisão', async () => {
    const renewal = await cycle('Anual', 132.4)
    assert.equal(renewal.commission_review_pending, true)
    assert.equal(renewal.status, 'Em aberto', 'não libera sozinha mesmo dentro da janela')
    assert.equal(renewal.commission_value, 132.4)
    s.renewal = renewal
})

test('worker de assinaturas não libera; liberar à mão é recusado', async () => {
    const worker = load('workers/subscriptionsWorker').default
    await worker.loop()
    await s.renewal.reload()
    assert.equal(s.renewal.status, 'Em aberto')
    await assert.rejects(call(PC.update, { params: { id: s.renewal.id }, body: { status: 'Liberado para pagamento' } }), /a revisar/)
})

test('aparece na lista de revisão e, confirmado com novo valor, libera a cobrança ao fornecedor', async () => {
    let r = await call(PC.index, { query: { commission_review: '1', limit: -1 } })
    assert.deepEqual(r.body.data.map((p) => p.id), [s.renewal.id])
    r = await call(PC.confirmCommission, { params: { id: s.renewal.id }, body: { commission_value: 140.1 } })
    assert.equal(r.code, 200)
    assert.equal(r.body.released, true)
    await s.renewal.reload()
    assert.equal(s.renewal.commission_review_pending, false)
    assert.equal(s.renewal.status, 'Liberado para pagamento')
    const bp = await M.BillingProtocol.findOne({ where: { ProtocolId: s.renewal.id } })
    assert.equal(bp.value, 140.1)
    assert.equal((await M.Billing.findByPk(bp.BillingId)).SupplierId, s.supplier.id)
})

test('mensal (ex.: 365) repete o valor e libera normalmente', async () => {
    const renewal = await cycle('Mensal', 50)
    assert.equal(renewal.commission_review_pending, false)
    assert.equal(renewal.status, 'Liberado para pagamento')
    assert.equal(renewal.commission_value, 50)
})
