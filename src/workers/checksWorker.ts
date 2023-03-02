import axios from 'axios'

import Check from '../models/Check'
import Client from '../models/Client'
import Project from '../models/Project'
import sendMail from '../utils/sendEmail'

export default new (class checksWorker {
    public setup(): void {
        this.loop()

        setInterval(() => {
            this.loop()
        }, 600000)
    }

    private async loop(): Promise<void> {
        const checks = await Check.findAll({
            include: [{ model: Project, include: [Client] }],
        })

        for await (let check of checks) {
            try {
                const response = await axios.get(check.url, {
                    validateStatus: (status) => {
                        return check?.verify_status ? status == 200 : true
                    },
                })

                const $ = response.data

                check.return = eval(check.path_return)

                const c = eval(check.condition)
                if (!c && check.status == 'Error') continue
                if (c && check.status == 'OK') continue

                if (!c) {
                    check.status = 'Error'

                    if (check.send_alert)
                        sendMail(
                            check.Project.Client.email,
                            `[${check.Project.name}] - ${check.description}`,
                            check.message,
                        )
                } else {
                    check.status = 'OK'
                }

                await check.save()
            } catch (e) {
                check.status = 'Error'
                check.return = 'Error'
                await check.save()
            }
        }
    }
})()
