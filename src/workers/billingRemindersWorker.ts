import { runBillingReminders } from '../utils/billingReminders'

// A cada 30 min; cada etapa de cada cobrança sai uma única vez (travada pelo EmailLog).
export default new (class billingRemindersWorker {
    public setup(): void {
        this.loop()

        setInterval(() => {
            this.loop()
        }, 30 * 60 * 1000)
    }

    private async loop(): Promise<void> {
        try {
            const result = await runBillingReminders()
            if (result.sent > 0) console.log(`[lembretes] ${result.sent} lembrete(s) de cobrança enviado(s)`)
        } catch (err) {
            console.error('[lembretes] falha ao processar lembretes de cobrança', err)
        }
    }
})()
