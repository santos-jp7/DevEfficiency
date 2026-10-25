import axios from 'axios'
import moment from 'moment'

import Check from '../models/Check'
import Client from '../models/Client'
import Project from '../models/Project'
import { parseEmails, sendAlertEmail } from '../utils/resendMail'

const REQUEST_TIMEOUT_MS = 15000

const escapeHtml = (text: unknown) =>
    String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

export default new (class checksWorker {
    private running = false

    public setup(): void {
        this.loop()

        setInterval(() => {
            this.loop()
        }, 600000)
    }

    // Aviso de queda/recuperação. Sai pelo Resend (com SMTP como reserva) e nunca derruba o worker.
    private async notify(check: Check, kind: 'down' | 'up', detail: string): Promise<void> {
        try {
            const to = parseEmails(check.Project?.Client?.email)
            const cc = parseEmails(process.env.EMAIL_CC)
            if (to.length === 0 && cc.length === 0) {
                console.error(`[checks] #${check.id} sem destinatário para o alerta`)
                return
            }

            const project = check.Project?.name || 'Projeto'
            const subject =
                kind === 'down'
                    ? `[${project}] - ${check.description}`
                    : `[Restabelecido] [${project}] - ${check.description}`

            const headline =
                kind === 'down'
                    ? escapeHtml(check.message)
                    : `O serviço voltou a responder normalmente: <strong>${escapeHtml(check.description)}</strong>.`

            const html = `
                <p>${headline}</p>
                <p style="color:#666;font-size:13px">
                    Verificação: ${escapeHtml(check.description)}<br>
                    URL: ${escapeHtml(check.url)}<br>
                    Horário: ${moment().format('DD/MM/YYYY HH:mm')}<br>
                    ${kind === 'down' ? `Detalhe: ${escapeHtml(detail)}` : ''}
                </p>`

            // Sem contato do cliente, o aviso vai ao menos para a cópia interna.
            const channel = await sendAlertEmail({ to: to.length ? to : cc, cc: to.length ? cc : undefined, subject, html })
            console.log(`[checks] alerta (${kind}) enviado via ${channel} para check #${check.id}`)
        } catch (err) {
            console.error(`[checks] falha ao enviar alerta do check #${check.id}`, err)
        }
    }

    private async loop(): Promise<void> {
        if (this.running) return
        this.running = true

        try {
            const checks = await Check.findAll({
                include: [{ model: Project, include: [Client] }],
            })

            for (const check of checks) {
                try {
                    await this.run(check)
                } catch (err) {
                    console.error(`[checks] erro inesperado no check #${check.id}`, err)
                }
            }
        } catch (err) {
            console.error('[checks] erro ao carregar verificações', err)
        } finally {
            this.running = false
        }
    }

    private async run(check: Check): Promise<void> {
        let ok = false
        let detail = ''

        try {
            const response = await axios.get(check.url, {
                timeout: REQUEST_TIMEOUT_MS,
                validateStatus: (status) => {
                    return check?.verify_status ? status == 200 : true
                },
            })

            const $ = response.data

            check.return = eval(check.path_return)

            ok = !!eval(check.condition)
            if (!ok) detail = `Condição não atendida (retorno: ${check.return})`
        } catch (e: any) {
            // Plataforma fora do ar (timeout, DNS, status != 200...) também é queda e precisa avisar.
            ok = false
            check.return = 'Error'
            detail = e?.response?.status ? `HTTP ${e.response.status}` : e?.message || 'Falha na requisição'
        }

        const previous = check.status
        const next = ok ? 'OK' : 'Error'

        // Sem mudança de estado não repete o aviso (queda contínua) nem regrava o registro.
        if (previous === next) return

        check.status = next
        await check.save()

        if (check.send_alert) await this.notify(check, ok ? 'up' : 'down', detail)
    }
})()
