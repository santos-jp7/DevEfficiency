import Client from '../models/Client'

// Dados iniciais: Delos Soluções Inteligentes (ClientId 1) é cliente parceiro com 25% de desconto em serviços.
// Só roda enquanto o cliente ainda não tem percentual definido, para não sobrescrever ajustes manuais.
async function seedPartnerClients(): Promise<void> {
    const delos = await Client.findByPk(1)

    if (delos && !delos.is_partner && delos.partner_discount_percent === null && /delos/i.test(delos.name)) {
        await delos.update({ is_partner: true, partner_discount_percent: 25 })
    }
}

export default seedPartnerClients
