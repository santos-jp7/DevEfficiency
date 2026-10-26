let __api__ = null

const app = new Vue({
    el: '#protocol',
    data: {
        protocol: {
            status: 'Em aberto',
        },
        id: null,
        discountPct: null,
        payloads: {
            protocolRegister: {
                description: null,
                value: null,
                type: null,
                estimated_hours: null,
                hourly_rate: null,
                manual_override: false,
            },
            protocolProduct: {
                charge_type: null,
                value: null,
                discount: 0,
                quantity: 1,
                ProductId: null,
            },
            receipt: {
                value: null,
                method: null,
                note: null,
            },
        },
        hourlyRate: 120,
        references: {
            products: [],
            bankAccounts: [],
            sellers: [],
        },
    },
    mounted() {
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

        if (params.id) {
            __api__.get(`/api/protocols/${params.id}`).then((res) => {
                this.protocol = res.data
            })
        }

        __api__
            .get('/api/config/hourly_rate')
            .then(({ data }) => {
                if (Number(data?.value) > 0) this.hourlyRate = Number(data.value)
            })
            .catch(() => {})

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
            .get('/api/sellers')
            .then(({ data }) => {
                this.$data.references.sellers = data || []
            })
            .catch(() => {})

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
    },
    computed: {
        isPartner() {
            return !!this.protocol?.Client?.is_partner
        },
        partnerPercent() {
            return this.isPartner ? Number(this.protocol.Client.partner_discount_percent) || 0 : 0
        },
        showRegisterValue() {
            const r = this.payloads.protocolRegister
            return r.type !== 'Serviço' || this.isLegacyService || !!r.manual_override
        },
        // % do snapshot do item em edição; senão o % atual do cliente.
        registerPartnerPercent() {
            const r = this.payloads.protocolRegister
            if (r.id && r.estimated_hours != null && r.gross_value != null) return Number(r.partner_discount_percent) || 0
            return this.isPartner ? Number(this.protocol.Client.partner_discount_percent) || 0 : 0
        },
        registerPreview() {
            const r = this.payloads.protocolRegister
            if (r.type !== 'Serviço' || !(Number(r.estimated_hours) > 0)) return null
            return Pricing.calc(r.estimated_hours, r.hourly_rate || this.hourlyRate, this.registerPartnerPercent)
        },
        // Serviço lançado antes do cálculo por horas: continua com valor direto.
        isLegacyService() {
            const r = this.payloads.protocolRegister
            return !!r.id && r.type === 'Serviço' && r.gross_value == null
        },
        protocolGross() {
            return (
                (this.protocol?.Protocol_registers?.reduce((s, v) => s + v.value, 0) || 0) +
                (this.protocol?.Protocol_products?.reduce((s, v) => s + v.value, 0) || 0)
            )
        },
        discountedTotal() {
            return this.protocolGross - (Number(this.protocol?.discount_value) || 0)
        },
        installmentValue() {
            const n = this.protocol?.total_installments
            if (!n || n <= 1) return 0
            return parseFloat((this.discountedTotal / n).toFixed(2))
        },
    },
    methods: {
        applyDiscountPct() {
            if (!this.discountPct) return
            this.protocol.discount_value = parseFloat(((this.protocolGross / 100) * this.discountPct).toFixed(2))
        },
        handlerSubmit() {
            let method = this.$data.protocol.id ? __api__.put : __api__.post
            let url = this.$data.protocol.id ? '/api/protocols/' + this.$data.protocol.id : '/api/protocols'

            method(url, {
                status: this.protocol.status,
                notes: this.protocol.notes,
                current_installment: this.protocol.current_installment || null,
                total_installments: this.protocol.total_installments || null,
                discount_value: this.protocol.discount_value || null,
                SellerId: this.protocol.SellerId || null,
            })
                .then((res) => {
                    alert('Protocolo atualizado com sucesso!')
                    window.location.reload()
                })
                .catch((err) => {
                    alert('Erro ao atualizar protocolo.')
                    console.error(err)
                })
        },
        brl: (v) => Pricing.brl(v),
        pct: (v) => Pricing.percent(v),
        hoursFmt: (v) => Pricing.hours(v),
        formatCurrency(value) {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
        },
        formatDate(date) {
            return moment(date).format('DD/MM/YYYY')
        },
        handlerNewProtocolRegister() {
            this.$data.payloads.protocolRegister = {
                description: null,
                value: null,
                type: null,
                estimated_hours: null,
                hourly_rate: this.hourlyRate,
                manual_override: false,
            }

            $('#protocolRegisterModal').modal('toggle')
        },
        handlerEditProtocolRegister(protocolRegisterId) {
            const register = this.protocol.Protocol_registers.find((v) => v.id == protocolRegisterId)

            this.$data.payloads.protocolRegister = {
                ...register,
                hourly_rate: register.hourly_rate ?? this.hourlyRate,
            }

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

            const r = this.$data.payloads.protocolRegister
            const priced = r.type === 'Serviço' && Number(r.estimated_hours) > 0

            method(url, {
                description: r.description,
                type: r.type,
                ProtocolId: this.$data.protocol.id,
                ...(priced
                    ? {
                          estimated_hours: r.estimated_hours,
                          hourly_rate: r.hourly_rate,
                          manual_override: !!r.manual_override,
                          ...(r.manual_override ? { value: r.value } : {}),
                      }
                    : { value: r.value }),
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
                quantity: 1,
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
                ProtocolId: this.$data.protocol.id,
                ...(this.$data.payloads.protocolProduct.id ? {} : { quantity: this.$data.payloads.protocolProduct.quantity || 1 }),
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
                ProtocolId: this.$data.protocol.id,
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
    },
})
