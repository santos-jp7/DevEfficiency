import { FastifyRequest, FastifyReply } from 'fastify'

import { sendPayablesAlert } from '../utils/payablesAlert'

class payablesAlertController {
    // Envio manual (teste): ignora horário e "já enviado hoje".
    static async send(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        try {
            const result = await sendPayablesAlert({ force: true })
            return res.send(result)
        } catch (err: any) {
            console.error(err)
            return res.status(500).send({ message: err.message || 'Erro ao enviar o aviso.' })
        }
    }
}

export default payablesAlertController
