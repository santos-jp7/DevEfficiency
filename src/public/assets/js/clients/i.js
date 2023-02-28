let __api__ = null

const client = new Vue({
    el: '#client',
    data: {
        id: 0,
        name: null,
        corporate_name: null,
        document: null,
        email: null,
        Credentials: [],
        Projects: [],
        Servers: [],
        Service_orders: [],
        Contacts: [],
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
            .then(({ data }) => {
                Object.keys(data).forEach((key) => (this.$data[key] = data[key]))

                this.maskDocument()
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
