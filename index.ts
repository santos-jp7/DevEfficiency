import 'dotenv/config'

import app from './src/app'
import jobs from './src/jobs'
import syncModels from './src/sync'
;(async () => {
    await syncModels()

    jobs()

    await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT) || 3000 })
})()
