let __api__ = null

const service_order = new Vue({
    el: '#service_order',
    data: {
        id: 0,
        subject: null,
        description: null,
        status: null,
        createdAt: null,
        ProjectId: null,
        Protocol: {
            id: null,
            status: null,
            Protocol_registers: [],
            Receipts: [],
        },
        payloads: {
            protocolRegister: {
                description: null,
                value: null,
                type: null,
            },
        },
    },
    methods: {
        handlerSubmit(e) {
            e.preventDefault()

            __api__
                .put('/api/os/' + this.$data.id, {
                    subject: this.$data.subject,
                    description: this.$data.description,
                    status: this.$data.status,
                })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerProtocolSubmit(e) {
            e.preventDefault()

            __api__
                .put('/api/protocols/' + this.$data.Protocol.id, {
                    status: this.$data.Protocol.status,
                })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerNewProtocolRegister() {
            this.$data.payloads.protocolRegister = {
                description: null,
                value: null,
                type: null,
            }

            $('#protocolRegisterModal').modal('toggle')
        },
        handlerEditSubproject(protocolRegisterId) {
            this.$data.payloads.protocolRegister = this.Protocol.Protocol_registers.find(
                (v) => v.id == protocolRegisterId,
            )

            $('#protocolRegisterModal').modal('toggle')
        },
        handlerDeleteSubproject(protocolRegisterId) {
            if (!confirm('Confirma exclusão?')) return

            __api__.delete('/api/protocols/registers/' + protocolRegisterId)
            window.location.reload()
        },
        handlerProtocolRegistertSubmit(e) {
            e.preventDefault()

            let method = this.$data.payloads.protocolRegister.id ? __api__.put : __api__.post
            let url = this.$data.payloads.protocolRegister.id
                ? '/api/protocols/registers/' + this.$data.payloads.protocolRegister.id
                : '/api/protocols/registers'

            method(url, {
                description: this.$data.payloads.protocolRegister.description,
                value: this.$data.payloads.protocolRegister.value,
                type: this.$data.payloads.protocolRegister.type,
            })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
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
            .get('/api/os/' + params.id)
            .then(({ data }) => {
                if (!data.Protocol) data.Protocol = {}

                data.Protocol.Protocol_registers = []
                data.Protocol.Receipts = []

                Object.keys(data).forEach((key) => (this.$data[key] = data[key]))

                __api__
                    .get('/api/protocols/' + data.Protocol.id)
                    .then(({ data }) => {
                        this.$data.Protocol = data
                    })
                    .catch((error) => {
                        console.log(error)

                        alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    })
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
