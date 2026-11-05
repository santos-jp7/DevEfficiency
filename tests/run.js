// Executa cada arquivo *.test.js em sequência, em um processo próprio (todos usam o mesmo banco de teste).
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const only = process.argv.slice(2)
const files = fs
    .readdirSync(__dirname)
    .filter((f) => f.endsWith('.test.js'))
    .filter((f) => only.length === 0 || only.some((o) => f.includes(o)))
    .sort()

let failed = 0
for (const file of files) {
    console.log(`\n=== ${file}`)
    const r = spawnSync(process.execPath, ['--test', path.join(__dirname, file)], { stdio: 'inherit', env: process.env })
    if (r.status !== 0) failed++
}

console.log(failed ? `\n${failed} arquivo(s) com falha.` : `\n${files.length} arquivo(s) de teste ok.`)
process.exit(failed ? 1 : 0)
