import Config from '../models/Config'
import { nowInBusinessTimezone } from '../utils/payablesAlert'

async function seedConfigs(): Promise<void> {
    const defaultConfigs = [
        { type: 'name', value: 'Minha Empresa Ltda.', upload: false },
        { type: 'company_description', value: 'Descrição da empresa', upload: false },
        { type: 'logo', value: 'default_logo.png', upload: true }, // Placeholder path for logo
        { type: 'cert', value: 'default_cert.pfx', upload: true }, // Placeholder path for certificate
        { type: 'cert_pass', value: 'minhasenhadocertificado', upload: false },
        { type: 'address', value: 'Rua Exemplo, 123, Cidade - Estado, CEP 12345-678', upload: false },
        { type: 'cnpj', value: '12.345.678/0001-90', upload: false },
        { type: 'im', value: '0000000001', upload: false },
        { type: 'contact', value: '(XX) XXXX-XXXX', upload: false },
        { type: 'email', value: 'contato@minhaempresa.com.br', upload: false },
        { type: 'default_day_due', value: '20', upload: false },
        { type: 'hourly_rate', value: '120.00', upload: false },
        // Aviso diário de contas a pagar (vários e-mails separados por vírgula).
        { type: 'payables_alert_email', value: 'jean.pierre@codlinx.com.br', upload: false },
        { type: 'payables_alert_days', value: '3', upload: false },
        { type: 'payables_alert_enabled', value: 'true', upload: false },
        // Conferência de saldo das contas bancárias (aviso quando o saldo diverge das movimentações).
        { type: 'balance_alert_enabled', value: 'true', upload: false },
        { type: 'balance_alert_email', value: 'jean.pierre@codlinx.com.br', upload: false },
        // TRAVA dos e-mails automáticos ao cliente (lembretes, etapas da OS, chamados): off | test | live.
        // Começa em "test": nada vai a clientes, tudo chega só em auto_email_test_to. Troque para "live" quando validar.
        { type: 'auto_email_mode', value: 'test', upload: false },
        { type: 'auto_email_test_to', value: 'jean.pierre@codlinx.com.br', upload: false },
        // Só cobranças com vencimento a partir desta data recebem lembrete (padrão: dia do primeiro deploy).
        { type: 'checks_failure_threshold', value: '2', upload: false },
        // Diferença máxima (R$) aceita para conciliar automaticamente extrato × sistema.
        { type: 'reconciliation_tolerance', value: '0.05', upload: false },
        { type: 'billing_reminder_start_date', value: nowInBusinessTimezone().date, upload: false },
        // Lembretes automáticos de cobrança: dias em relação ao vencimento (negativo = antes, positivo = atraso).
        { type: 'billing_reminders_enabled', value: 'true', upload: false },
        { type: 'billing_reminder_schedule', value: '-3,0,1,7,15', upload: false },
        // E-mails ao cliente a cada etapa da OS e nos chamados.
        { type: 'os_email_enabled', value: 'true', upload: false },
        { type: 'tickets_email_enabled', value: 'true', upload: false },
        { type: 'tickets_notify_email', value: 'jean.pierre@codlinx.com.br', upload: false },
        // Dias antes do vencimento para liberar a cobrança da assinatura (padrão 45: mensais liberam na renovação).
        { type: 'subscription_release_days', value: '45', upload: false },
    ]

    for (const configData of defaultConfigs) {
        await Config.findOrCreate({
            where: { type: configData.type },
            defaults: configData,
        })
    }

    console.log('Default configurations seeded successfully.')
}

export default seedConfigs
