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
        },
        Project: {
            name: null,
            Client: {
                id: null,
                name: null,
            },
        },
        Client: { name: null },
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
        },
        references: {
            products: [],
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
    },
})
