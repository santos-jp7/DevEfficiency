import 'dotenv/config'

import puppeteer, { Browser } from 'puppeteer'

declare global {
    var browser: Browser
}

;(async () => {
    global.browser = await puppeteer.launch({
        headless: true,
        executablePath: '/usr/bin/google-chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    })
})()

import app from './src/app'
import jobs from './src/jobs'
import syncModels from './src/sync'
;(async () => {
    await syncModels()

    jobs()

    await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT) || 3000 })
})()
