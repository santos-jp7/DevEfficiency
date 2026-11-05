// Infra comum dos testes de integração: banco MySQL/MariaDB descartável + controllers reais do build de teste.
// Cada arquivo de teste roda em um processo próprio (ver tests/run.js) e recria o banco do zero.
const path = require('path')

const TEST_DB = process.env.TEST_DB_NAME || 'devefficiency_test'
if (!/test/i.test(TEST_DB)) throw new Error(`TEST_DB_NAME precisa conter "test" (recebido: ${TEST_DB}) — o banco é apagado a cada execução.`)

process.env.DB_NAME = TEST_DB
process.env.DB_HOST = process.env.TEST_DB_HOST || process.env.DB_HOST || 'localhost'
process.env.DB_USER = process.env.TEST_DB_USER || process.env.DB_USER || 'root'
process.env.DB_PASS = process.env.TEST_DB_PASS ?? process.env.DB_PASS ?? ''
process.env.SECRET = process.env.SECRET || 'test-secret'
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test'
process.env.MCP_API_KEY = process.env.MCP_API_KEY || 'test-mcp-key'

const BUILD = path.join(__dirname, '..', '.test-build', 'src')
const load = (rel) => require(path.join(BUILD, rel))

// E-mails nunca saem dos testes: o que seria enviado fica em sentEmails.
const sentEmails = []
function muteEmails() {
    const resend = load('utils/resendMail')
    resend.sendResendEmail = async (msg) => void sentEmails.push(msg)
    resend.sendAlertEmail = async (msg) => (sentEmails.push(msg), 'resend')
    const smtp = load('utils/sendEmail')
    smtp.default = (to, subject, html) => void sentEmails.push({ to, subject, html })
}

async function resetDatabase() {
    const { Sequelize } = require('sequelize')
    const admin = new Sequelize('', process.env.DB_USER, process.env.DB_PASS, { host: process.env.DB_HOST, dialect: 'mysql', logging: false })
    await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``)
    await admin.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await admin.close()
}

// Recria o banco, sincroniza os modelos (mesmo caminho do boot) e desliga e-mails automáticos.
async function setup() {
    muteEmails()
    await resetDatabase()
    const db = load('db').default
    db.options.logging = false
    await load('sync').default()
    await load('models/Config').default.update({ value: 'off' }, { where: { type: 'auto_email_mode' } })
    return db
}

// Chama um handler de controller como o Fastify faria e devolve { code, body }.
async function call(handler, req = {}) {
    const res = {
        code: 200,
        body: null,
        status(c) {
            this.code = c
            return this
        },
        send(b) {
            this.body = b && typeof b.toJSON === 'function' ? b.toJSON() : b
            return this
        },
        header() {
            return this
        },
    }
    await handler({ params: {}, query: {}, body: {}, ...req }, res)
    return res
}

const model = (name) => load(`models/${name}`).default
const controller = (rel) => load(`controllers/${rel}`).default

async function teardown() {
    await load('db').default.close()
}

module.exports = { load, model, controller, call, setup, teardown, sentEmails }
