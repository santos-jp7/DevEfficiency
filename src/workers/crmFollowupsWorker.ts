import { sendCrmFollowupsAlert } from '../utils/crmFollowupsAlert'

// Verifica a cada 30 min; o aviso sai uma vez por dia, a partir do horário configurado (CRM_FOLLOWUPS_HOUR, padrão 8h).
export default new (class crmFollowupsWorker {
    public setup(): void {
        this.loop()

        setInterval(() => {
            this.loop()
        }, 30 * 60 * 1000)
    }

    private async loop(): Promise<void> {
        try {
            const result = await sendCrmFollowupsAlert()
            if (result.sent) console.log(`[crm] aviso de follow-ups enviado (${result.count}) para ${result.to?.join(', ')}`)
        } catch (err) {
            console.error('[crm] falha ao enviar aviso de follow-ups', err)
        }
    }
})()
