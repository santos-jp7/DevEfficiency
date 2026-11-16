// Assinatura com cliente inadimplente: todo ciclo é cobrado, pague ou não (a cobrança do mês não espera o pagamento
// do mês anterior). Ciclos de antes da data de início da regra (subscription_cycle_start_date) não são retroativos.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const moment = require('moment')
const { setup, teardown, call, model, load } = require('./helpers')

let M, worker, receipt
const ymd = (d) => moment(d).format('YYYY-MM-DD')

before(async () => {
    await setup()
    M = Object.fromEntries(
        ['Client', 'Product', 'Protocol', 'Protocol_product', 'Subscription', 'BillingProtocol', 'Billing', 'BankAccount', 'Config'].map((n) => [n, model(n)]),
    )
    worker = load('workers/subscriptionsWorker').default
    receipt = load('utils/billingReceipt').default
})
after(teardown)

async function setStart(date) {
    await M.Config.update({ value: date }, { where: { type: 'subscription_cycle_start_date' } })
}

// Assinatura mensal de R$ 500 com o primeiro ciclo (vencido em `due`) liberado e sem pagamento.
async function delinquent(name, due) {
    const client = await M.Client.create({ name, due_day: moment(due).date() })
    const product = await M.Product.create({ description: `Suporte ${name}`, value: 500 })
    const sub = await M.Subscription.create({ ClientId: client.id, dueAt: due, status: 'Pendente' })
    const p = await M.Protocol.create({ SubscriptionId: sub.id, status: 'Em aberto' })
    await M.Protocol_product.create({ ProtocolId: p.id, ProductId: product.id, value: 500, charge_type: 'Mensal' })
    await p.reload()
    await p.update({ status: 'Liberado para pagamento' })
    // Vencimento da cobrança do 1º ciclo = vencimento do ciclo.
    const bp = await M.BillingProtocol.findOne({ where: { ProtocolId: p.id } })
    await M.Billing.update({ due_date: due }, { where: { id: bp.BillingId } })
    return { client, sub, first: p }
}

const cycles = (sub) => M.Protocol.findAll({ where: { SubscriptionId: sub.id }, order: [['id', 'ASC']] })
const pay = async (protocolId, bank) => {
    const bp = await M.BillingProtocol.findOne({ where: { ProtocolId: protocolId } })
    const billing = await M.Billing.findByPk(bp.BillingId)
    // Cobrança em atraso exige confirmar o valor recebido (multa/juros são informativos).
    const r = await call(receipt, { body: { id: bp.BillingId, method: 'Pix', BankAccountId: bank.id, received_value: Number(billing.total_value) } })
    assert.equal(r.code, 200, JSON.stringify(r.body))
}

test('inadimplente há 3 meses: o worker gera a cobrança de cada mês, sem esperar o pagamento', async () => {
    await setStart('2020-01-01')
    const due = moment().subtract(3, 'months').date(10).hour(12).toDate()
    const { sub, client } = await delinquent('Atrasado', due)

    await worker.loop()
    const ps = await cycles(sub)
    // Ciclo vencido + os 3 meses seguintes já vencidos/do mês + o próximo que entra na janela de liberação.
    const expectedDue = [1, 2, 3].map((n) => moment(due).add(n, 'months').format('YYYY-MM-DD'))
    assert.ok(ps.length >= 4, `esperava ao menos 4 ciclos, veio ${ps.length}`)
    assert.ok(ps.every((p) => p.status === 'Liberado para pagamento'), 'todos os ciclos cobrados')
    await sub.reload()
    assert.ok(moment(sub.dueAt).isSameOrAfter(moment(), 'day'), 'vencimento alcança a data de hoje')
    assert.ok(expectedDue.every((d) => moment(sub.dueAt).isSameOrAfter(d, 'day')))
    assert.equal(sub.status, 'Não pago')

    // Todos os meses viram dívida em aberto do cliente; nada entra na cobrança vencida do 1º mês.
    const billings = await M.Billing.findAll({ where: { ClientId: client.id } })
    const total = billings.reduce((s, b) => s + Number(b.total_value), 0)
    assert.equal(total, 500 * ps.length)
    const firstBilling = await M.Billing.findByPk((await M.BillingProtocol.findOne({ where: { ProtocolId: ps[0].id } })).BillingId)
    assert.equal(Number(firstBilling.total_value), 500, 'cobrança vencida não recebe os meses novos')

    // Rodar de novo não duplica.
    await worker.loop()
    assert.equal((await cycles(sub)).length, ps.length)
})

test('pagando o mês atrasado 3 meses depois: não cria renovação extra nem pula meses', async () => {
    await setStart('2020-01-01')
    const bank = await M.BankAccount.create({ name: 'Banco', balance: 0 })
    const due = moment().subtract(3, 'months').date(10).hour(12).toDate()
    const { sub } = await delinquent('Paga atrasado', due)
    await worker.loop()
    const before = await cycles(sub)
    const dueAt = ymd((await sub.reload()).dueAt)

    await pay(before[0].id, bank)
    const after = await cycles(sub)
    assert.equal(after.length, before.length, 'pagar um ciclo antigo não gera outra renovação')
    assert.equal(after[0].status, 'Fechado')
    assert.ok(after.slice(1).every((p) => p.status === 'Liberado para pagamento'), 'os outros meses continuam cobrados')
    assert.equal(ymd((await sub.reload()).dueAt), dueAt)

    // Quitando tudo, o último pagamento gera a renovação seguinte normalmente.
    // Os meses gerados de uma vez na recuperação podem estar na mesma cobrança: paga cada cobrança uma vez.
    const paid = new Set()
    for (const p of after.slice(1)) {
        const bp = await M.BillingProtocol.findOne({ where: { ProtocolId: p.id } })
        if (paid.has(bp.BillingId)) continue
        paid.add(bp.BillingId)
        await pay(p.id, bank)
    }
    const final = await cycles(sub)
    assert.equal(final.length, after.length + 1)
    assert.equal(ymd((await sub.reload()).dueAt), moment(dueAt).add(1, 'month').format('YYYY-MM-DD'))
    await worker.loop()
    assert.notEqual((await sub.reload()).status, 'Não pago')
})

test('no próprio dia do vencimento ainda não gera o mês seguinte', async () => {
    await setStart('2020-01-01')
    const { sub } = await delinquent('Vence hoje', moment().hour(12).toDate())
    await worker.loop()
    assert.equal((await cycles(sub)).length, 1)
})

test('meses de antes da data de início da regra não são cobrados retroativamente', async () => {
    const due = moment().subtract(3, 'months').date(10).hour(12).toDate()
    await setStart(moment().subtract(1, 'months').date(1).format('YYYY-MM-DD'))
    const { sub } = await delinquent('Antigo', due)
    await worker.loop()
    const ps = await cycles(sub)
    // Os vencimentos gerados começam na data de início (o mês de há 2 meses ficou de fora).
    await sub.reload()
    assert.ok(ps.length < 5, `não deveria cobrar os 3 meses anteriores: ${ps.length} ciclos`)
    assert.ok(moment(sub.dueAt).isSameOrAfter(moment().subtract(1, 'months').date(1), 'day'))
})

test('dia a dia: venceu ontem sem pagamento → o mês seguinte ganha cobrança própria', async () => {
    await setStart('2020-01-01')
    const { sub, client } = await delinquent('Ontem', moment().subtract(1, 'day').hour(12).toDate())
    await worker.loop()
    const ps = await cycles(sub)
    assert.equal(ps.length, 2)
    const ids = await Promise.all(ps.map(async (p) => (await M.BillingProtocol.findOne({ where: { ProtocolId: p.id } })).BillingId))
    assert.notEqual(ids[0], ids[1], 'mês novo não entra na cobrança vencida')
    assert.equal(await M.Billing.count({ where: { ClientId: client.id } }), 2)
    assert.equal(ymd((await sub.reload()).dueAt), moment().subtract(1, 'day').add(1, 'month').format('YYYY-MM-DD'))
})
