import Config from '../models/Config'

async function seedConfigs(): Promise<void> {
    const defaultConfigs = [
        { type: 'name', value: 'Minha Empresa Ltda.', upload: false },
        { type: 'company_description', value: 'Descrição da empresa', upload: false },
        { type: 'logo', value: 'default_logo.png', upload: true }, // Placeholder path for logo
        { type: 'cert', value: 'default_cert.pfx', upload: true }, // Placeholder path for certificate
        { type: 'cert_pass', value: 'minhasenhadocertificado', upload: false },
        { type: 'address', value: 'Rua Exemplo, 123, Cidade - Estado, CEP 12345-678', upload: false },
        { type: 'cnpj', value: '12.345.678/0001-90', upload: false },
        { type: 'contact', value: '(XX) XXXX-XXXX', upload: false },
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
