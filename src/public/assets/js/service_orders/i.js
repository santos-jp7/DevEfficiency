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
        ClientId: null,
        Protocol: {
            id: null,
            status: null,
            Protocol_registers: [],
            Protocol_products: [],
            Receipts: [],
            notes: null,
        },
        Project: {
            name: null,
            Client: {
                id: null,
                name: null,
            },
        },
        Client: { name: null },
        apontamentos: [],
        payloads: {
            protocolRegister: {
                description: null,
                value: null,
                type: null,
            },
            protocolProduct: {
                charge_type: null,
                value: null,
                discount: 0,
                ProductId: null,
            },
            receipt: {
                value: null,
                method: null,
                note: null,
            },
            apontamento: {
                id: null,
                description: '',
                date: new Date().toISOString().slice(0, 10),
                status: 'Em andamento',
                public: false,
            },
            invoice: {
                currency: 'USD',
                BankAccountId: '',
            },
        },
        references: {
            products: [],
            bankAccounts: [],
        },
    },
    computed: {
        protocolInstallmentValue() {
            const total =
                (this.Protocol?.Protocol_registers?.reduce((s, v) => s + v.value, 0) || 0) +
                (this.Protocol?.Protocol_products?.reduce((s, v) => s + v.value, 0) || 0)
            const n = this.Protocol?.total_installments
            if (!n || n <= 1) return 0
            return parseFloat((total / n).toFixed(2))
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
                    notes: this.$data.Protocol.notes,
                    current_installment: this.$data.Protocol.current_installment || null,
                    total_installments: this.$data.Protocol.total_installments || null,
                })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerNewApontamento() {
            this.payloads.apontamento = {
                id: null,
                description: '',
                date: new Date().toISOString().slice(0, 10),
                status: 'Em andamento',
                public: false,
            }
            new bootstrap.Modal(document.getElementById('apontamentoModal')).show()
        },
        handlerEditApontamento(a) {
            this.payloads.apontamento = {
                id: a.id,
                description: a.description,
                date: moment.utc(a.date).format('YYYY-MM-DD'),
                status: a.status,
                public: a.public,
            }
            new bootstrap.Modal(document.getElementById('apontamentoModal')).show()
        },
        async handlerDeleteApontamento(id) {
            if (!confirm('Confirma exclusão?')) return
            try {
                await __api__.delete('/api/os-entries/' + id)
                this.apontamentos = this.apontamentos.filter((a) => a.id !== id)
            } catch (e) {
                alert('Erro ao excluir apontamento.')
            }
        },
        async handlerApontamentoSubmit() {
            const payload = {
                description: this.payloads.apontamento.description,
                date: this.payloads.apontamento.date,
                status: this.payloads.apontamento.status,
                public: this.payloads.apontamento.public,
                ServiceOrderId: this.id,
            }
            try {
                if (this.payloads.apontamento.id) {
                    const { data } = await __api__.put('/api/os-entries/' + this.payloads.apontamento.id, payload)
                    const idx = this.apontamentos.findIndex((a) => a.id === data.id)
                    if (idx !== -1) this.$set(this.apontamentos, idx, data)
                } else {
                    const { data } = await __api__.post('/api/os-entries', payload)
                    this.apontamentos.push(data)
                }
                bootstrap.Modal.getInstance(document.getElementById('apontamentoModal')).hide()
            } catch (e) {
                alert(e.response?.data?.message || 'Erro ao salvar apontamento.')
            }
        },
        handlerNewProtocolRegister() {
            this.$data.payloads.protocolRegister = {
                description: null,
                value: null,
                type: null,
            }

            $('#protocolRegisterModal').modal('toggle')
        },
        handlerEditProtocolRegister(protocolRegisterId) {
            this.$data.payloads.protocolRegister = this.Protocol.Protocol_registers.find(
                (v) => v.id == protocolRegisterId,
            )

            $('#protocolRegisterModal').modal('toggle')
        },
        handlerDeleteProtocolRegister(protocolRegisterId) {
            if (!confirm('Confirma exclusão?')) return

            __api__.delete('/api/protocols/registers/' + protocolRegisterId)
            window.location.reload()
        },
        handlerProtocolRegisterSubmit(e) {
            e.preventDefault()

            let method = this.$data.payloads.protocolRegister.id ? __api__.put : __api__.post
            let url = this.$data.payloads.protocolRegister.id
                ? '/api/protocols/registers/' + this.$data.payloads.protocolRegister.id
                : '/api/protocols/registers'

            method(url, {
                description: this.$data.payloads.protocolRegister.description,
                value: this.$data.payloads.protocolRegister.value,
                type: this.$data.payloads.protocolRegister.type,
                ProtocolId: this.$data.Protocol.id,
            })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        async handlerNewProtocolProduct() {
            this.$data.payloads.protocolProduct = {
                charge_type: null,
                value: null,
                discount: 0,
                ProductId: null,
            }

            $('#protocolProductModal').modal('toggle')
        },
        handlerEditProtocolProduct(protocolProductId) {
            this.$data.payloads.protocolProduct = this.Protocol.Protocol_products.find((v) => v.id == protocolProductId)

            $('#protocolProductModal').modal('toggle')
        },
        handlerDeleteProtocolProduct(protocolProductId) {
            if (!confirm('Confirma exclusão?')) return

            __api__.delete('/api/protocols/products/' + protocolProductId)
            window.location.reload()
        },
        handlerProtocolProductsSubmit(e) {
            e.preventDefault()

            let method = this.$data.payloads.protocolProduct.id ? __api__.put : __api__.post
            let url = this.$data.payloads.protocolProduct.id
                ? '/api/protocols/products/' + this.$data.payloads.protocolProduct.id
                : '/api/protocols/products'

            method(url, {
                charge_type: this.$data.payloads.protocolProduct.charge_type,
                value: this.$data.payloads.protocolProduct.value,
                ProductId: this.$data.payloads.protocolProduct.ProductId,
                ProtocolId: this.$data.Protocol.id,
            })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerProtocolProductsChangeChargeType() {
            if (!this.$data.payloads.protocolProduct.charge_type) return (this.$data.payloads.protocolProduct.value = 0)

            if (
                this.$data.payloads.protocolProduct.charge_type == 'Único' ||
                this.$data.payloads.protocolProduct.charge_type == 'Mensal'
            )
                return (this.$data.payloads.protocolProduct.value = this.$data.references.products.find(
                    (v) => v.id == this.$data.payloads.protocolProduct.ProductId,
                ).value)

            if (this.$data.payloads.protocolProduct.charge_type == 'Anual')
                return (this.$data.payloads.protocolProduct.value =
                    this.$data.references.products.find((v) => v.id == this.$data.payloads.protocolProduct.ProductId)
                        .value * 12)
        },
        handlerProtocolProductsChangeDiscount() {
            if (!this.$data.payloads.protocolProduct.value) {
                this.$data.payloads.protocolProduct.discount = 0
                return alert('Preencher valor nulo.')
            }

            let value = this.$data.references.products.find(
                (v) => v.id == this.$data.payloads.protocolProduct.ProductId,
            ).value

            if (this.$data.payloads.protocolProduct.charge_type == 'Anual') value *= 12

            this.$data.payloads.protocolProduct.value =
                value - (value / 100) * this.$data.payloads.protocolProduct.discount
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
            this.$data.payloads.receipt = this.Protocol.Receipts.find((v) => v.id == receiptId)

            $('#receiptModal').modal('toggle')
        },
        handlerDeleteReceipt(receiptId) {
            if (!confirm('Confirma exclusão?')) return

            __api__.delete('/api/protocols/receipts/' + receiptId)
            window.location.reload()
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
                ProtocolId: this.$data.Protocol.id,
                BankAccountId: this.$data.payloads.receipt.BankAccountId,
            })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerNewInvoice() {
            this.$data.payloads.invoice = {
                currency: 'USD',
                BankAccountId: '',
            }

            new bootstrap.Modal(document.getElementById('invoiceModal')).show()
        },
        handlerInvoiceSubmit() {
            const params = new URLSearchParams({
                currency: this.$data.payloads.invoice.currency,
                ...(this.$data.payloads.invoice.BankAccountId
                    ? { BankAccountId: this.$data.payloads.invoice.BankAccountId }
                    : {}),
            })

            window.open(`/api/os/${this.$data.id}/invoice-pdf?${params.toString()}`, '_blank')

            bootstrap.Modal.getInstance(document.getElementById('invoiceModal')).hide()
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

        __api__
            .get('/api/products')
            .then(({ data }) => {
                if (!data) return

                this.$data.references.products = data
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })

        __api__
            .get('/api/bank-accounts')
            .then(({ data }) => {
                if (!data) return
                this.$data.references.bankAccounts = data
            })
            .catch((error) => {
                console.log(error)
                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })

        __api__
            .get('/api/os-entries?serviceOrderId=' + params.id)
            .then(({ data }) => {
                this.apontamentos = data
            })
            .catch((error) => {
                console.log(error)
            })
    },
})
