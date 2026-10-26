import { runBalanceAlert } from '../utils/balanceAlert'

// A cada hora (e na subida): confere os saldos; o e-mail só sai quando a situação muda.
export default new (class balanceWorker {
    public setup(): void {
        this.loop()

        setInterval(() => {
            this.loop()
        }, 60 * 60 * 1000)
    }

    private async loop(): Promise<void> {
        try {
            const result = await runBalanceAlert()
            if (result.sent) console.log(`[saldo] aviso enviado (${result.divergent} divergente(s), ${result.pending_setup} sem saldo inicial)`)
        } catch (err) {
            console.error('[saldo] falha na conferência de saldo', err)
        }
    }
})()
