import { sendPayablesAlert } from '../utils/payablesAlert'

// Verifica a cada 30 min; o aviso sai uma vez por dia, a partir do horário configurado (PAYABLES_ALERT_HOUR, padrão 8h).
export default new (class payablesWorker {
    public setup(): void {
        this.loop()

        setInterval(() => {
            this.loop()
        }, 30 * 60 * 1000)
    }

    private async loop(): Promise<void> {
        try {
            const result = await sendPayablesAlert()
            if (result.sent) console.log(`[contas a pagar] aviso enviado (${result.count} contas) para ${result.to?.join(', ')}`)
        } catch (err) {
            console.error('[contas a pagar] falha ao enviar aviso', err)
        }
    }
})()
