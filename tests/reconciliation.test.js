// Conciliação bancária: vínculos com muitos lançamentos (fatura de cartão) e lançamento coberto por várias linhas do
// extrato (6k em espécie que entrou como 5k + 1k), em grupo ou uma linha de cada vez.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const moment = require('moment')
const { setup, teardown, call, model, controller, load } = require('./helpers')

let C, M, R
const s = {}
const today = moment().format('YYYY-MM-DD')
let seq = 0

before(async () => {
    await setup()
    C = controller('reconciliationController')
    R = load('utils/reconciliation')
    M = Object.fromEntries(['BankAccount', 'Client', 'Billing', 'Payable', 'BankStatementEntry', 'BankEntryMatch'].map((n) => [n, model(n)]))
    s.bank = await M.BankAccount.create({ name: 'Conta', balance: 0 })
    s.client = await M.Client.create({ name: 'Cliente Espécie' })
})
after(teardown)

const entry = (amount) => M.BankStatementEntry.create({ dedupe_key: 'k' + ++seq, date: today, amount, description: 'linha ' + seq, BankAccountId: s.bank.id })
const paidBilling = (value) =>
    M.Billing.create({ ClientId: s.client.id, status: 'pago', total_value: value, paid_value: value, payment_date: new Date(), BankAccountId: s.bank.id, method: 'Espécie' })
const fully = async (type, id) => (await R.alreadyMatched(type, [id])).has(id)

test('uma linha de cada vez: 5k como parte, depois a linha de 1k é sugerida com o restante e concilia sozinha', async () => {
    const billing = await paidBilling(6000)
    const e5 = await entry(5000)
    const e1 = await entry(1000)

    let r = await call(C.match, { params: { id: e5.id }, body: { targets: [{ type: 'billing', id: billing.id }] } })
    assert.equal(r.code, 409)
    assert.equal(r.body.can_partial, true)
    assert.equal(r.body.difference, -1000)

    r = await call(C.match, { params: { id: e5.id }, body: { targets: [{ type: 'billing', id: billing.id }], partial: true } })
    assert.equal(r.code, 200, JSON.stringify(r.body))
    const link = await M.BankEntryMatch.findOne({ where: { BankStatementEntryId: e5.id } })
    assert.equal(link.value, 5000)
    assert.equal(await fully('billing', billing.id), false, 'ainda falta 1k')

    // Lado do sistema: aparece com o restante.
    r = await call(C.unreconciled, { query: { BankAccountId: String(s.bank.id) } })
    const pending = r.body.billings.find((b) => b.id === billing.id)
    assert.equal(pending.value, 1000)
    assert.equal(pending.partial, true)

    // A linha de 1k tem a cobrança como sugestão (restante) e a conciliação automática fecha.
    const candidates = await R.findCandidates(await M.BankStatementEntry.findByPk(e1.id))
    assert.deepEqual(candidates.map((c) => [c.type, c.id, c.value]), [['billing', billing.id, 1000]])
    assert.equal(await R.autoMatchPending(s.bank.id), 1)
    assert.equal(await fully('billing', billing.id), true)
    assert.equal((await M.BankStatementEntry.findByPk(e1.id)).status, 'conciliado')
})

test('em grupo: as duas linhas (5k + 1k) ligadas de uma vez à cobrança de 6k', async () => {
    const billing = await paidBilling(6000)
    const a = await entry(5000)
    const b = await entry(1000)
    const r = await call(C.groupMatch, { body: { entryIds: [a.id, b.id], targets: [{ type: 'billing', id: billing.id }] } })
    assert.equal(r.code, 200, JSON.stringify(r.body))
    const links = await M.BankEntryMatch.findAll({ where: { target_type: 'billing', target_id: billing.id }, order: [['value', 'DESC']] })
    assert.deepEqual(links.map((l) => l.value), [5000, 1000])
    assert.equal(await fully('billing', billing.id), true)
    for (const e of [a, b]) {
        await e.reload()
        assert.equal(e.status, 'conciliado')
        assert.equal(e.match_difference, null)
    }

    // Desfazer uma das linhas reabre só a parte dela.
    await call(C.unmatch, { params: { id: b.id } })
    assert.equal(await fully('billing', billing.id), false)
    const left = await R.remainingAmounts('billing', new Map([[billing.id, 6000]]))
    assert.equal(left.get(billing.id).remaining, 1000)
})

test('fatura do cartão: uma saída ligada a 25 contas pagas (mais de 10 de uma vez)', async () => {
    const ids = []
    for (let i = 0; i < 25; i++) {
        const p = await M.Payable.create({ description: 'Compra ' + i, value: 10, dueDate: today, paymentDate: today, status: 'pago', BankAccountId: s.bank.id })
        ids.push(p.id)
    }
    const fatura = await entry(-250)
    const r = await call(C.match, { params: { id: fatura.id }, body: { targets: ids.map((id) => ({ type: 'payable', id })) } })
    assert.equal(r.code, 200, JSON.stringify(r.body))
    assert.equal(await M.BankEntryMatch.count({ where: { BankStatementEntryId: fatura.id } }), 25)
})

test('linhas somando mais que os lançamentos só com "aceitar diferença", que fica registrada', async () => {
    const billing = await paidBilling(100)
    const e = await entry(102)
    let r = await call(C.match, { params: { id: e.id }, body: { targets: [{ type: 'billing', id: billing.id }] } })
    assert.equal(r.code, 409)
    assert.equal(r.body.can_partial, false)
    r = await call(C.match, { params: { id: e.id }, body: { targets: [{ type: 'billing', id: billing.id }], force: true } })
    assert.equal(r.code, 200)
    await e.reload()
    assert.equal(e.match_difference, 2)
})

test('grupo recusa mistura de entradas e saídas', async () => {
    const a = await entry(50)
    const b = await entry(-50)
    const r = await call(C.groupMatch, { body: { entryIds: [a.id, b.id], targets: [{ type: 'billing', id: 1 }] } })
    assert.equal(r.code, 400)
})
