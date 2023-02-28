import axios from 'axios'

import Check from '../models/Check'

export default new (class checksWorker {
    public setup(): void {
        this.loop()

        setInterval(() => {
            this.loop()
        }, 600000)
    }

    private async loop(): Promise<void> {
        const checks = await Check.findAll()

        for await (let check of checks) {
            try {
                const response = await axios.get(check.url)
                const $ = response.data

                const c = eval(check.condition)
                if (!c && check.status == 'Error') continue
                if (c && check.status == 'OK') continue

                if (!c) {
                    check.status = 'Error'

                    //Envia alerta
                } else {
                    check.status = 'OK'
                }

                await check.save()
            } catch (e) {
                console.log(e)

                check.status = 'Error'
                await check.save()
            }
        }
    }
})()
