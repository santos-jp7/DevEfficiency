let __api__ = null

const client = new Vue({
    el: '#client',
    data: {
        id: 0,
        isInternational: false,
        cnpjLookupLoading: false,
        name: null,
        corporate_name: null,
        document: null,
        email: null,
        due_day: 20,
        Credentials: [],
        Billings: [],
        Subscriptions: [],
        Projects: [],
        Servers: [],
        Service_orders: [],
        Contacts: [],
        Protocols: [],
        Addresses: [],
        calcs: {
            protocols: {},
        },
        payloads: {
            project: {
                id: null,
                name: null,
                url: null,
                type: null,
            },
            credential: {
                id: null,
                host: null,
                username: null,
                password: null,
            },
            server: {
                id: null,
                description: null,
                provider: null,
                host: null,
                username: null,
                password: null,
                rsa: null,
            },
            service_order: {
                subject: null,
                description: null,
            },
            contact: {
                id: null,
                name: null,
                number: null,
                email: null,
                whatsapp: null,
            },
            address: {
                id: null,
                type: null,
                street_name: null,
                number: null,
                complement: null,
                district: null,
                city: null,
                state: null,
                zip: null,
                ibge: null,
            },
        },
    },
    methods: {
        handlerSubmit(e) {
            e.preventDefault()

            let method = this.$data.id ? __api__.put : __api__.post
            let url = this.$data.id ? '/api/clients/' + this.$data.id : '/api/clients'

            method(url, {
                name: this.$data.name,
                corporate_name: this.$data.corporate_name,
                document: this.$data.document,
                email: this.$data.email,
                due_day: this.$data.due_day,
            })
                .then(({ data }) => {
                    window.location.href = '/clients/i?id=' + data.id
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerNewProject() {
            this.$data.payloads.project = {
                id: null,
                name: null,
                url: null,
                type: null,
            }

            $('#newProjectModal').modal('toggle')
        },
        handlerNewProjectSubmit(e) {
            e.preventDefault()

            __api__
                .post('/api/projects', {
                    name: this.$data.payloads.project.name,
                    url: this.$data.payloads.project.url,
                    type: this.$data.payloads.project.type,
                    ClientId: this.$data.id,
                })
                .then(({ data }) => {
                    window.location.href = '/projects/i?id=' + data.id
                })
                .catch((e) =>
                    console.log(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.'),
                )
        },
        handlerNewCredential() {
            this.$data.payloads.credential = {
                id: null,
                host: null,
                username: null,
                password: null,
            }

            $('#credentialModal').modal('toggle')
        },
        handlerEditCredential(credentialId) {
            this.$data.payloads.credential = this.Credentials.find((v) => v.id == credentialId)

            $('#credentialModal').modal('toggle')
        },
        handlerDeleteCredential(credentialId) {
            if (!confirm('Confirma exclusão?')) return

            __api__.delete('/api/credentials/' + credentialId)
            window.location.reload()
        },
        handlerCredentialSubmit(e) {
            e.preventDefault()

            let method = this.$data.payloads.credential.id ? __api__.put : __api__.post
            let url = this.$data.payloads.credential.id
                ? '/api/credentials/' + this.$data.payloads.credential.id
                : '/api/credentials'

            method(url, {
                description: this.$data.payloads.credential.description,
                host: this.$data.payloads.credential.host,
                username: this.$data.payloads.credential.username,
                password: this.$data.payloads.credential.password,
                ClientId: this.$data.id,
            })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerNewContact() {
            this.$data.payloads.contact = {
                id: null,
                name: null,
                email: null,
                number: null,
                whatsapp: null,
            }

            $('#contactModal').modal('toggle')
        },
        handlerEditContact(contactId) {
            this.$data.payloads.contact = this.Contacts.find((v) => v.id == contactId)

            $('#contactModal').modal('toggle')
        },
        handlerDeleteContact(contactId) {
            if (!confirm('Confirma exclusão?')) return

            __api__.delete('/api/contacts/' + contactId)
            window.location.reload()
        },
        handlerContactSubmit(e) {
            e.preventDefault()

            let method = this.$data.payloads.contact.id ? __api__.put : __api__.post
            let url = this.$data.payloads.contact.id
                ? '/api/contacts/' + this.$data.payloads.contact.id
                : '/api/contacts'

            method(url, {
                name: this.$data.payloads.contact.name,
                email: this.$data.payloads.contact.email,
                number: this.$data.payloads.contact.number,
                whatsapp: this.$data.payloads.contact.whatsapp,
                ClientId: this.$data.id,
            })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerNewAddress() {
            this.$data.payloads.address = {
                id: null,
                type: null,
                street_name: null,
                number: null,
                complement: null,
                district: null,
                city: null,
                state: null,
                zip: null,
                ibge: null,
            }

            $('#addressModal').modal('toggle')
        },
        handlerEditAddress(addressId) {
            this.$data.payloads.address = this.Addresses.find((v) => v.id == addressId)

            $('#addressModal').modal('toggle')
        },
        handlerDeleteAddress(addressId) {
            if (!confirm('Confirma exclusão?')) return

            __api__.delete('/api/addresses/' + addressId)
            window.location.reload()
        },
        handlerAddressSubmit(e) {
            e.preventDefault()

            let method = this.$data.payloads.address.id ? __api__.put : __api__.post
            let url = this.$data.payloads.address.id
                ? '/api/addresses/' + this.$data.payloads.address.id
                : '/api/addresses'

            method(url, {
                type: this.$data.payloads.address.type,
                street_name:
                    this.$data.payloads.address.street_name == '' ? null : this.$data.payloads.address.street_name,
                number: this.$data.payloads.address.number == '' ? null : this.$data.payloads.address.number,
                complement:
                    this.$data.payloads.address.complement == '' ? null : this.$data.payloads.address.complement,
                district: this.$data.payloads.address.district == '' ? null : this.$data.payloads.address.district,
                city: this.$data.payloads.address.city == '' ? null : this.$data.payloads.address.city,
                state: this.$data.payloads.address.state,
                zip: (this.$data.payloads.address.zip || '').replace(/[^0-9]/g, ''),
                ibge: this.$data.payloads.address.ibge,
                ClientId: this.$data.id,
            })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerNewServer() {
            this.$data.payloads.server = {
                id: null,
                description: null,
                provider: null,
                host: null,
                username: null,
                password: null,
                rsa: null,
            }

            $('#serverModal').modal('toggle')
        },
        handlerServerSubmit(e) {
            e.preventDefault()

            __api__
                .post('/api/servers', {
                    description: this.$data.payloads.server.description,
                    provider: this.$data.payloads.server.provider,
                    host: this.$data.payloads.server.host,
                    username: this.$data.payloads.server.username,
                    password: this.$data.payloads.server.password,
                    rsa: this.$data.payloads.server.rsa,
                    ClientId: this.$data.id,
                })
                .then(({ data }) => {
                    window.location.href = '/servers/i?id=' + data.id
                })
                .catch((e) =>
                    console.log(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.'),
                )
        },
        handlerNewOs() {
            $('#newOsModal').modal('toggle')
        },
        handlerNewOsSubmit(e) {
            e.preventDefault()

            __api__
                .post('/api/os', {
                    subject: this.$data.payloads.service_order.subject,
                    description: this.$data.payloads.service_order.description,
                    ClientId: this.$data.id,
                })
                .then(({ data }) => {
                    window.location.href = '/service_orders/i?id=' + data.id
                })
                .catch((e) =>
                    console.log(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.'),
                )
        },
        async lookupCnpj() {
            const raw = (this.document || '').replace(/\D/g, '')
            if (raw.length !== 14) return alert('Informe um CNPJ com 14 dígitos antes de buscar.')
            this.cnpjLookupLoading = true
            try {
                const { data } = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${raw}`)
                this.name = data.razao_social || this.name
                this.corporate_name = data.nome_fantasia || this.corporate_name
                this.email = data.email || this.email
                this.payloads.address = {
                    id: null,
                    type: 'Cobrança',
                    street_name: data.logradouro || '',
                    number: data.numero || '',
                    complement: data.complemento || '',
                    district: data.bairro || '',
                    city: data.municipio || '',
                    state: data.uf || '',
                    zip: String(data.cep || '').replace(/\D/g, ''),
                    ibge: String(data.codigo_municipio_ibge || ''),
                }
                $('#addressModal').modal('show')
            } catch (e) {
                alert('CNPJ não encontrado. Preencha os dados manualmente.')
            } finally {
                this.cnpjLookupLoading = false
            }
        },
        maskDocument() {
            if (!this.$data.document) return

            this.$data.document = this.$data.document.replace(/[^a-zA-Z0-9 ]/g, '')

            if (this.$data.document.length <= 11)
                this.$data.document = this.$data.document.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/g, '$1.$2.$3-$4')
            else
                this.$data.document = this.$data.document.replace(
                    /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/g,
                    '$1.$2.$3/$4-$5',
                )
        },
        calcProtocols() {
            // let protocols = []

            // if (this.$data.Service_orders?.length)
            //     for (let service_order of this.$data.Service_orders) {
            //         protocols.push(service_order.Protocol)
            //     }

            // if (this.$data.Subscriptions?.length)
            //     for (let subscription of this.$data.Subscriptions) {
            //         for (let protocol of subscription.Protocols) {
            //             protocols.push(protocol)
            //         }
            //     }

            const groups = Object.groupBy(this.$data.Protocols.data, ({ status }) => status)
            const keys = Object.keys(groups)

            let receiptTotal = 0

            this.$data.calcs.protocols['Os'] = 0

            this.$data.calcs.protocols['Produtos'] = 0
            this.$data.calcs.protocols['Produtos - Lucro'] = 0
            this.$data.calcs.protocols['Produtos - Custo'] = 0

            for (let key of keys) {
                this.$data.calcs.protocols[`Os - ${key}`] = 0

                this.$data.calcs.protocols[`Produtos - ${key}`] = 0
                this.$data.calcs.protocols[`Produtos - Lucro - ${key}`] = 0
                this.$data.calcs.protocols[`Produtos - Custo - ${key}`] = 0
            }

            for (let key of keys) {
                this.$data.calcs.protocols[key] = 0

                for (let { Protocol_products, Protocol_registers, Receipts } of groups[key]) {
                    const protocolRegistersTotal = Protocol_registers.reduce((sum, v) => sum + v.value, 0)

                    const protocolProductsTotal = Protocol_products.reduce((sum, v) => sum + v.value, 0)
                    const protocolProductsCoust = Protocol_products.reduce((sum, v) => sum + v.Product.coust, 0)
                    let protocolProductsProfit = protocolProductsTotal - protocolProductsCoust

                    this.$data.calcs.protocols[key] += protocolRegistersTotal
                    this.$data.calcs.protocols[key] += protocolProductsTotal

                    this.$data.calcs.protocols['Os'] += protocolRegistersTotal
                    this.$data.calcs.protocols[`Os - ${key}`] += protocolRegistersTotal

                    this.$data.calcs.protocols['Produtos'] += protocolProductsTotal
                    this.$data.calcs.protocols['Produtos - Lucro'] += protocolProductsProfit
                    this.$data.calcs.protocols['Produtos - Custo'] += protocolProductsCoust

                    this.$data.calcs.protocols[`Produtos - ${key}`] += protocolProductsTotal
                    this.$data.calcs.protocols[`Produtos - Lucro - ${key}`] += protocolProductsProfit
                    this.$data.calcs.protocols[`Produtos - Custo - ${key}`] += protocolProductsCoust

                    const registerGroups = Object.groupBy(Protocol_registers, ({ type }) => type)
                    const registerKeys = Object.keys(registerGroups)

                    for (let registerKey of registerKeys) {
                        if (!(`Os - ${registerKey}` in this.$data.calcs.protocols))
                            this.$data.calcs.protocols[`Os - ${registerKey}`] = 0

                        if (!(`Os - ${registerKey} - ${key}` in this.$data.calcs.protocols))
                            this.$data.calcs.protocols[`Os - ${registerKey} - ${key}`] = 0

                        const productProtocolTotal = registerGroups[registerKey].reduce((sum, v) => sum + v.value, 0)

                        this.$data.calcs.protocols[`Os - ${registerKey}`] += productProtocolTotal
                        this.$data.calcs.protocols[`Os - ${registerKey} - ${key}`] += productProtocolTotal
                    }

                    const receipts = Receipts.reduce((sum, v) => sum + v.value, 0)
                    if (key == 'Liberado para pagamento' || key == 'Em aberto')
                        this.$data.calcs.protocols[key] -= receipts

                    receiptTotal += receipts
                }
            }

            if ('Fechado' in this.$data.calcs.protocols)
                if (receiptTotal != this.$data.calcs.protocols['Fechado'])
                    this.$data.calcs.protocols['Total pago'] = receiptTotal

            client.$data.calcs.protocols = Object.keys(client.$data.calcs.protocols)
                .sort()
                .reduce(function (acc, key) {
                    acc[key] = client.$data.calcs.protocols[key]
                    return acc
                }, {})
        },
        formatCurrency(value) {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
        },
        formatDate(date) {
            return moment(date).format('DD/MM/YYYY')
        },
        statusColor(status) {
            switch (status) {
                case 'pendente':
                    return 'warning'
                case 'pago':
                    return 'success'
                case 'cancelado':
                    return 'danger'
                default:
                    return 'secondary'
            }
        },
    },
    mounted: function () {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const type = localStorage.getItem('type')

        if (!token || !expires_in || !type) return (location.href = '/')
        if (expires_in <= new Date().valueOf()) return (location.href = '/')

        const params = new Proxy(new URLSearchParams(window.location.search), {
            get: (searchParams, prop) => searchParams.get(prop),
        })

        __api__ = axios.create({
            headers: {
                Authorization: [type, token].join(' '),
            },
        })

        __api__.get('/api/auth/verify').catch((error) => {
            console.log(error)

            localStorage.clear()

            location.href = '/'
        })

        __api__
            .get('/api/clients/' + params.id)
            .then(async ({ data }) => {
                Object.keys(data).forEach((key) => (this.$data[key] = data[key]))

                this.$data.Service_orders = (await __api__.get('/api/os?limit=5&ClientId=' + data.id)).data
                this.$data.Subscriptions = (await __api__.get('/api/subscriptions?ClientId=' + data.id)).data
                this.$data.Protocols = (await __api__.get('/api/protocols?limit=-1&ClientId=' + data.id)).data
                this.$data.Billings = (await __api__.get('/api/billings?limit=5&ClientId=' + data.id)).data

                this.maskDocument()
                this.calcProtocols()
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
