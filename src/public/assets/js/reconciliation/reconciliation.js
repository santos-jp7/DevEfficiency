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
        selected: [],
        compare: null,
        tolerance: 0.05,
        balanceForm: { amount: '', date: moment().format('YYYY-MM-DD') },
        moment,
    },
    computed: {
        selectedSum() {
            return this.selected.reduce((s, i) => s + i.value, 0)
        },
    },
    methods: {
        brl: (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0),
        date: (v) => (v ? moment(String(v).slice(0, 10)).format('DD/MM/YYYY') : ''),
        statusColor: (s) => ({ pendente: 'warning', conciliado: 'success', ignorado: 'secondary' }[s] || 'secondary'),
        typeLabel: (t) => ({ billing: 'Cobrança recebida', receipt: 'Recibo', payable: 'Conta paga', transfer: 'Transferência' }[t] || t),
        fail(error, fallback) {
            alert(error.response?.data?.message || fallback)
        },
        async loadAll() {
            await Promise.all([this.loadSummary(), this.loadEntries(), this.loadImports(), this.loadCompare()])
            if (this.tab === 'sistema') this.loadUnreconciled()
        },
        async loadSummary() {
            this.summary = (await __api__.get('/api/reconciliation/summary', { params: { BankAccountId: this.accountId } })).data
            this.tolerance = this.summary.tolerance
        },
        async loadCompare() {
            this.compare = (await __api__.get('/api/reconciliation/balance-compare', { params: { BankAccountId: this.accountId } })).data
        },
        async saveStatementBalance() {
            if (this.balanceForm.amount === '') return alert('Informe o saldo do extrato.')
            try {
                this.compare = (await __api__.post('/api/reconciliation/statement-balance', { BankAccountId: this.accountId, amount: this.balanceForm.amount, date: this.balanceForm.date })).data
            } catch (error) {
                this.fail(error, 'Não foi possível registrar o saldo.')
            }
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
            this.unreconciledList = [...data.billings, ...data.receipts, ...data.payables, ...data.transfers].sort((a, b) => b.date.localeCompare(a.date))
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
        // Um clique numa sugestão = vincular só aquele lançamento.
        match(entry, target) {
            return this.matchMany(entry, [target])
        },
        async matchMany(entry, targets, force = false) {
            try {
                await __api__.post(`/api/reconciliation/entries/${entry.id}/match`, {
                    targets: targets.map((t) => ({ type: t.type, id: t.id })),
                    force,
                })
                this.closeManual()
                await this.loadAll()
            } catch (error) {
                if (error.response?.data?.diverges && !force) {
                    const diff = error.response.data.difference
                    if (confirm(`Os valores divergem em ${this.brl(diff)} (extrato − lançamentos). Vincular mesmo assim? A diferença fica registrada.`)) return this.matchMany(entry, targets, true)
                    return
                }
                this.fail(error, 'Não foi possível conciliar.')
            }
        },
        async createExpense(entry) {
            const description = prompt(`Lançar ${this.brl(Math.abs(entry.amount))} como despesa paga (a conta bancária já reflete esse débito).\n\nDescrição:`, entry.description || 'Tarifa bancária')
            if (description === null) return
            try {
                await __api__.post(`/api/reconciliation/entries/${entry.id}/expense`, { description })
                await this.loadAll()
            } catch (error) {
                this.fail(error, 'Não foi possível lançar a despesa.')
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
            this.selected = []
            const { data } = await __api__.get('/api/reconciliation/unreconciled', {
                params: {
                    BankAccountId: this.accountId,
                    startDate: moment(entry.date).subtract(60, 'days').format('YYYY-MM-DD'),
                    endDate: moment(entry.date).add(60, 'days').format('YYYY-MM-DD'),
                },
            })
            const transfers = data.transfers.filter((t) => t.direction === (entry.amount > 0 ? 'in' : 'out'))
            const pool = entry.amount > 0 ? [...data.billings, ...data.receipts, ...transfers] : [...data.payables, ...transfers]
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
