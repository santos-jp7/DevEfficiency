let __api__ = null

const app = new Vue({
    el: '#billing',
    data: {
        billing: {},
        id: null,
        currentProtocolId: null,
        currentValue: 0,
        sendingEmail: false,

        bankAccounts: [],
    },
    computed: {
        boletoFile() {
            if (!this.billing.BillingFiles) return null
            return [...this.billing.BillingFiles]
                .filter(f => f.type === 'boleto')
                .sort((a, b) => b.id - a.id)[0] || null
        },
        notaFiscalFile() {
            if (!this.billing.BillingFiles) return null
            return [...this.billing.BillingFiles]
                .filter(f => f.type === 'nota_fiscal')
                .sort((a, b) => b.id - a.id)[0] || null
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
            this.id = params.id

            __api__.get(`/api/billings/${params.id}`).then((res) => {
                this.billing = res.data
                if (this.billing.due_date) this.billing.due_date = moment.utc(this.billing.due_date).format('YYYY-MM-DD')
                if (this.billing.payment_date)
                    this.billing.payment_date = moment.utc(this.billing.payment_date).format('YYYY-MM-DD')
            })
        }

        __api__
            .get('/api/bank-accounts')
            .then((res) => {
                this.bankAccounts = res.data
            })
            .catch((err) => {
                console.error(err)

                alert('Erro ao carregar contas bancárias.')
            })
    },
    methods: {
        updateBilling() {
            __api__
                .put(`/api/billings/${this.id}`, this.billing)
                .then((res) => {
                    alert('Cobrança atualizada com sucesso!')
                    window.location.reload()
                })
                .catch((err) => {
                    alert('Erro ao atualizar cobrança.')
                    console.error(err)
                })
        },
        deleteBilling() {
            if (confirm('Tem certeza que deseja excluir esta cobrança?')) {
                __api__
                    .delete(`/api/billings/${this.id}`)
                    .then((res) => {
                        alert('Cobrança excluída com sucesso!')
                        window.location.href = './index.html'
                    })
                    .catch((err) => {
                        alert('Erro ao excluir cobrança.')
                        console.error(err)
                    })
            }
        },
        formatCurrency(value) {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
        },
        openValueModal(item) {
            this.currentProtocolId = item.id
            this.currentValue = item.value
            new bootstrap.Modal(document.getElementById('valueModal')).show()
        },
        updateValue() {
            __api__
                .put(`/api/billing-protocols/${this.currentProtocolId}`, { value: this.currentValue })
                .then((res) => {
                    // alert('Valor atualizado com sucesso!')
                    window.location.reload()
                })
                .catch((err) => {
                    alert('Erro ao atualizar valor.')
                    console.error(err)
                })
        },
        divideValue(x) {
            this.currentValue = (this.currentValue / x).toFixed(2)
        },
        reducePercentage(x) {
            this.currentValue = ((this.currentValue / 100) * x).toFixed(2)
        },
        async uploadFile(type, event) {
            const file = event.target.files[0]
            if (!file) return

            const formData = new FormData()
            formData.append('type', type)
            formData.append('file', file)

            try {
                const res = await __api__.post(`/api/billings/${this.id}/upload`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                })
                const data = res.data
                const file = data.billingFile || data
                if (!this.billing.BillingFiles) this.billing.BillingFiles = []
                this.billing.BillingFiles.push(file)
                if (data.billingStatus) this.billing.status = data.billingStatus
                alert('Arquivo enviado com sucesso!')
            } catch (err) {
                alert(err.response?.data?.message || 'Erro ao enviar arquivo.')
                console.error(err)
            }
            event.target.value = ''
        },
        async sendEmail() {
            if (!confirm('Enviar email com a fatura para todos os contatos do cliente?')) return
            this.sendingEmail = true
            try {
                await __api__.post(`/api/billings/${this.id}/send-email`)
                alert('Email enviado com sucesso!')
            } catch (err) {
                alert(err.response?.data?.message || 'Erro ao enviar email.')
                console.error(err)
            } finally {
                this.sendingEmail = false
            }
        },
        handlerBillingReceipt() {
            if (!this.billing.method) {
                alert('Selecione o método de pagamento.')
                return
            }

            if (!this.billing.BankAccountId) {
                alert('Selecione a conta bancária.')
                return
            }

            if (
                !confirm(
                    `Confirma o recebimento de R$ ${this.formatCurrency(this.billing.total_value)} para esta cobrança?`,
                )
            )
                return

            __api__
                .post(`/api/billing-receipt`, {
                    method: this.billing.method,
                    BankAccountId: this.billing.BankAccountId,
                    id: this.billing.id,
                })
                .then((res) => {
                    alert('Cobrança recebida com sucesso!')
                    window.location.reload()
                })
                .catch((err) => {
                    alert(err.response.data.message || 'Erro ao receber cobrança.')
                    console.error(err)
                })
        },
    },
})
