let __api__ = null

const service_order = new Vue({
    el: '#subscription',
    data: {
        id: 0,
        name: null,
        status: null,
        dueAt: null,
        createdAt: null,
        ProjectId: null,
        ClientId: null,
        Project: {
            id: 0,
            name: null,
        },
        Client: {
            id: 0,
            name: null,
        },
        Protocols: [],
        Protocol: {
            id: null,
            status: null,
            Protocol_registers: [],
            Protocol_products: [],
            Receipts: [],
        },
        payloads: {
            protocol: {
                status: null,
                id: null,
            },
            receipt: {
                value: null,
                method: null,
                note: null,
                BankAccountId: null,
            },
        },
        references: {
            bankAccounts: [],
        },
    },
    methods: {
        handlerSubmit(e) {
            e.preventDefault()

            __api__
                .put('/api/subscriptions/' + this.$data.id, {
                    name: this.$data.name,
                    dueAt: this.$data.dueAt,
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
        handlerOpenProtocol(id) {
            this.$data.payloads.protocol = {
                id: null,
                status: null,
            }

            __api__
                .get('/api/protocols/' + id)
                .then(({ data }) => {
                    this.$data.payloads.protocol = data

                    $('#protocolModal').modal('toggle')
                })
                .catch((error) => {
                    console.log(error)

                    alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                })
        },
        handlerProtocolSubmit(e) {
            e.preventDefault()

            __api__
                .put('/api/protocols/' + this.$data.payloads.protocol.id, {
                    status: this.$data.payloads.protocol.status,
                })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerNewReceipt() {
            this.$data.payloads.receipt = {
                value: null,
                method: null,
                note: null,
                BankAccountId: null,
            }

            $('#receiptModal').modal('toggle')
        },
        handlerEditReceipt(receiptId) {
            this.$data.payloads.receipt = this.$data.payloads.protocol.Receipts.find((v) => v.id == receiptId)

            $('#receiptModal').modal('toggle')
        },
        handlerDeleteReceipt(receiptId) {
            if (!confirm('Confirma exclusão?')) return

            __api__.delete('/api/protocols/receipts/' + receiptId)
            __api__
                .get('/api/protocols/' + this.$data.payloads.protocol.id)
                .then(({ data }) => {
                    this.$data.payloads.protocol = data

                    $('#receiptModal').modal('toggle')
                })
                .catch((error) => {
                    console.log(error)

                    alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                })
        },
        handlerReceiptSubmit(e) {
            e.preventDefault()

            let method = this.$data.payloads.receipt.id ? __api__.put : __api__.post
            let url = this.$data.payloads.receipt.id
                ? '/api/protocols/receipts/' + this.$data.payloads.receipt.id
                : '/api/protocols/receipts'

            method(url, {
                value: this.$data.payloads.receipt.value,
                method: this.$data.payloads.receipt.method,
                note: this.$data.payloads.receipt.note,
                ProtocolId: this.$data.payloads.protocol.id,
                BankAccountId: this.$data.payloads.receipt.BankAccountId,
            })
                .then(() => {
                    __api__
                        .get('/api/protocols/' + this.$data.payloads.protocol.id)
                        .then(({ data }) => {
                            this.$data.payloads.protocol = data

                            $('#receiptModal').modal('toggle')
                        })
                        .catch((error) => {
                            console.log(error)

                            alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                        })
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
    },
    computed: {
        dueDate: {
            get() {
                return moment(this.$data.dueAt).format('YYYY-MM-DD')
            },
            set(date) {
                this.$data.dueAt = moment(date).toDate()
            },
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
            .get('/api/subscriptions/' + params.id)
            .then(({ data }) => {
                Object.keys(data).forEach((key) => (this.$data[key] = data[key]))

                __api__
                    .get('/api/protocols/' + data.Protocols[0].id)
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

        __api__
            .get('/api/bank-accounts')
            .then(({ data }) => {
                this.$data.references.bankAccounts = data
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
