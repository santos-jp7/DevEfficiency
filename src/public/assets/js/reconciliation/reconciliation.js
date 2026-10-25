let __api__ = null

const emptySummary = () => ({
    pendente: { count: 0, in: 0, out: 0 },
    conciliado: { count: 0, in: 0, out: 0 },
    ignorado: { count: 0, in: 0, out: 0 },
    system_balance: 0,
})

new Vue({
    el: '#app',
    data: {
        accounts: [],
        accountId: null,
        tab: 'extrato',
        importing: false,
        result: null,
        summary: emptySummary(),
        entries: [],
        imports: [],
        unreconciledList: [],
        filter: { status: 'pendente', direction: '', startDate: '', endDate: '' },
        manual: null,
        manualOptions: [],
        moment,
    },
    methods: {
        brl: (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0),
        date: (v) => (v ? moment(String(v).slice(0, 10)).format('DD/MM/YYYY') : ''),
        statusColor: (s) => ({ pendente: 'warning', conciliado: 'success', ignorado: 'secondary' }[s] || 'secondary'),
        typeLabel: (t) => ({ billing: 'Cobrança recebida', receipt: 'Recibo', payable: 'Conta paga' }[t] || t),
        fail(error, fallback) {
            alert(error.response?.data?.message || fallback)
        },
        async loadAll() {
            await Promise.all([this.loadSummary(), this.loadEntries(), this.loadImports()])
            if (this.tab === 'sistema') this.loadUnreconciled()
        },
        async loadSummary() {
            this.summary = (await __api__.get('/api/reconciliation/summary', { params: { BankAccountId: this.accountId } })).data
        },
        async loadEntries() {
            const params = { BankAccountId: this.accountId }
            Object.keys(this.filter).forEach((k) => this.filter[k] && (params[k] = this.filter[k]))
            this.entries = (await __api__.get('/api/reconciliation/entries', { params })).data
        },
        async loadImports() {
            this.imports = (await __api__.get('/api/reconciliation/imports', { params: { BankAccountId: this.accountId } })).data
        },
        async loadUnreconciled() {
            const { data } = await __api__.get('/api/reconciliation/unreconciled', { params: { BankAccountId: this.accountId } })
            this.unreconciledList = [...data.billings, ...data.receipts, ...data.payables].sort((a, b) => b.date.localeCompare(a.date))
        },
        async importFile() {
            const file = this.$refs.file.files[0]
            if (!file) return alert('Escolha um arquivo OFX ou CSV.')

            const form = new FormData()
            form.append('file', file)
            this.importing = true

            try {
                const { data } = await __api__.post(`/api/reconciliation/import?BankAccountId=${this.accountId}`, form)
                this.result = data
                this.$refs.file.value = ''
                await this.loadAll()
            } catch (error) {
                this.fail(error, 'Não foi possível importar o extrato.')
            } finally {
                this.importing = false
            }
        },
        async autoMatch() {
            try {
                const { data } = await __api__.post('/api/reconciliation/auto-match', { BankAccountId: this.accountId })
                alert(`${data.matched} lançamento(s) conciliado(s) automaticamente.`)
                await this.loadAll()
            } catch (error) {
                this.fail(error, 'Erro na conciliação automática.')
            }
        },
        async match(entry, target, force = false) {
            try {
                await __api__.post(`/api/reconciliation/entries/${entry.id}/match`, { type: target.type, id: target.id, force })
                this.closeManual()
                await this.loadAll()
            } catch (error) {
                if (error.response?.data?.diverges && !force) {
                    if (confirm('Os valores do extrato e do sistema divergem. Vincular mesmo assim?')) return this.match(entry, target, true)
                    return
                }
                this.fail(error, 'Não foi possível conciliar.')
            }
        },
        async act(entry, action) {
            try {
                await __api__.post(`/api/reconciliation/entries/${entry.id}/${action}`)
                await this.loadAll()
            } catch (error) {
                this.fail(error, 'Erro ao atualizar o lançamento.')
            }
        },
        async openManual(entry) {
            this.manual = entry
            const { data } = await __api__.get('/api/reconciliation/unreconciled', {
                params: {
                    BankAccountId: this.accountId,
                    startDate: moment(entry.date).subtract(60, 'days').format('YYYY-MM-DD'),
                    endDate: moment(entry.date).add(60, 'days').format('YYYY-MM-DD'),
                },
            })
            const pool = entry.amount > 0 ? [...data.billings, ...data.receipts] : data.payables
            // Valor igual primeiro, depois o mais próximo da data.
            this.manualOptions = pool.sort(
                (a, b) =>
                    (Math.abs(a.value - Math.abs(entry.amount)) < 0.01 ? 0 : 1) - (Math.abs(b.value - Math.abs(entry.amount)) < 0.01 ? 0 : 1) ||
                    Math.abs(moment(a.date).diff(entry.date, 'days')) - Math.abs(moment(b.date).diff(entry.date, 'days')),
            )
            bootstrap.Modal.getOrCreateInstance(document.getElementById('manualModal')).show()
        },
        closeManual() {
            const el = document.getElementById('manualModal')
            const modal = el && bootstrap.Modal.getInstance(el)
            if (modal) modal.hide()
        },
    },
    async mounted() {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const type = localStorage.getItem('type')

        if (!token || !expires_in || !type || expires_in <= new Date().valueOf()) return (location.href = '/')

        __api__ = axios.create({ headers: { Authorization: [type, token].join(' ') } })
        __api__.get('/api/auth/verify').catch(() => {
            localStorage.clear()
            location.href = '/'
        })

        try {
            this.accounts = (await __api__.get('/api/bank-accounts')).data || []
            if (this.accounts.length === 1) {
                this.accountId = this.accounts[0].id
                await this.loadAll()
            }
        } catch (error) {
            this.fail(error, 'Erro ao carregar as contas bancárias.')
        }
    },
})
