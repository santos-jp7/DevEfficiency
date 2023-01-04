import 'dotenv/config'

import app from './src/app'

import syncModels from './src/sync'
if (process.env.NODE_ENV != 'production') syncModels()

app.listen({ host: '0.0.0.0', port: Number(process.env.PORT) || 3000 })
