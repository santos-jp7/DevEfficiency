let __api__ = null
let chartInstance = null
let historyChartInstance = null
let _payModalBS = null
const MONTHS_PER_LOAD = 3
const PAGE_SIZE = 10
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function monthLabel(key) {
    if (key === 'sem-data') return 'Sem data definida'
    const m = moment(key, 'YYYY-MM')
    return `${MONTHS_PT[m.month()]} de ${m.year()}`
}
function monthShort(key) {
    const m = moment(key, 'YYYY-MM')
    return `${MONTHS_PT[m.month()].substring(0, 3)}/${m.format('YY')}`
}

const app = new Vue({
    el: '#app',
    data: {
        payables: [],
        bankAccounts: [],

        // Progressive loading
        progressiveStart: null,
        isFilterMode: false,
        loadingMore: false,
        hasMore: true,

        // Server-side filters (trigger API call via Buscar button)
        filterStart: '',
        filterEnd: '',
        filterSupplier: '',
        filterCostCenterServer: '',

        // Client-side filters (instant, no API call)
        filterDesc: '',
        filterStatus: 'todos',
        filterCostCenter: '',

        // Sort
        sortColumn: 'dueDate',
        sortDir: 'asc',

        // Pagination per month group
        monthCurrentPage: {},

        showPastMonths: true,
        chartReady: false,
        historyChartReady: false,

        // Payment modal
        payModal: { payable: null, value: 0, paymentDate: '', BankAccountId: '' },
        paying: false,
    },

    filters: {
        currency(value) {
            if (isNaN(parseFloat(value))) return 'R$ 0,00'
            return parseFloat(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        },
        date(value) {
            if (!value) return '-'
            return moment.utc(value).format('DD/MM/YYYY')
        },
    },

    watch: {
        filterDesc() { this.monthCurrentPage = {} },
        filterStatus() { this.monthCurrentPage = {} },
        filterCostCenter() { this.monthCurrentPage = {} },
        sortColumn() { this.monthCurrentPage = {} },
        sortDir() { this.monthCurrentPage = {} },
    },

    computed: {
        today() { return moment().startOf('day') },
        threeDaysFromNow() { return moment().startOf('day').add(3, 'days') },
        currentMonthKey() { return moment().format('YYYY-MM') },
        hasActiveFilters() {
            return this.filterStart || this.filterEnd || this.filterSupplier || this.filterCostCenterServer
        },

        // Summary cards — always from all loaded data (ignore client-side filters)
        summary() {
            const today = this.today
            const threeDays = this.threeDaysFromNow
            const firstDayMonth = moment().startOf('month')
            const lastDayMonth = moment().endOf('month')
            const pending = this.payables.filter(p => p.status === 'pendente')
            const overdue = pending.filter(p => p.dueDate && moment.utc(p.dueDate).isBefore(today))
            const upcoming = pending.filter(p => {
                const due = moment.utc(p.dueDate)
                return p.dueDate && !due.isBefore(today) && due.isSameOrBefore(threeDays)
            })
            const paidMonth = this.payables.filter(
                p => p.status === 'pago' && p.paymentDate &&
                    moment.utc(p.paymentDate).isBetween(firstDayMonth, lastDayMonth, 'day', '[]')
            )
            return {
                totalOpen: pending.reduce((s, p) => s + parseFloat(p.value || 0), 0),
                totalOpenCount: pending.length,
                overdueValue: overdue.reduce((s, p) => s + parseFloat(p.value || 0), 0),
                overdueCount: overdue.length,
                upcomingValue: upcoming.reduce((s, p) => s + parseFloat(p.value || 0), 0),
                upcomingCount: upcoming.length,
                paidMonthValue: paidMonth.reduce((s, p) => s + parseFloat(p.value || 0), 0),
                paidMonthCount: paidMonth.length,
            }
        },

        // Client-side filter pipeline
        filteredByDesc() {
            if (!this.filterDesc) return this.payables
            const q = this.filterDesc.toLowerCase()
            return this.payables.filter(p => (p.description || '').toLowerCase().includes(q))
        },

        filteredByCostCenter() {
            if (!this.filterCostCenter) return this.filteredByDesc
            const q = this.filterCostCenter.toLowerCase()
            return this.filteredByDesc.filter(p =>
                p.CostCenter && p.CostCenter.name.toLowerCase().includes(q)
            )
        },

        filteredByStatus() {
            const base = this.filteredByCostCenter
            const today = this.today
            if (this.filterStatus === 'todos') return base
            if (this.filterStatus === 'atrasado') {
                return base.filter(p =>
                    p.status === 'atrasado' ||
                    (p.status === 'pendente' && p.dueDate && moment.utc(p.dueDate).isBefore(today))
                )
            }
            if (this.filterStatus === 'pendente') {
                // pendente NOT overdue
                return base.filter(p =>
                    p.status === 'pendente' &&
                    (!p.dueDate || !moment.utc(p.dueDate).isBefore(today))
                )
            }
            return base.filter(p => p.status === this.filterStatus)
        },

        statusCounts() {
            const today = this.today
            const counts = { todos: 0, pendente: 0, pago: 0, cancelado: 0, atrasado: 0 }
            this.filteredByCostCenter.forEach(p => {
                counts.todos++
                const overdue = p.status === 'atrasado' ||
                    (p.status === 'pendente' && p.dueDate && moment.utc(p.dueDate).isBefore(today))
                if (overdue) { counts.atrasado++ }
                else if (p.status === 'pendente') { counts.pendente++ }
                else if (p.status === 'pago') { counts.pago++ }
                else if (p.status === 'cancelado') { counts.cancelado++ }
            })
            return counts
        },

        // Totals of currently visible items (after all client-side filters)
        visibleSummary() {
            const items = this.filteredByStatus
            return {
                count: items.length,
                total: items.reduce((s, p) => s + parseFloat(p.value || 0), 0),
                pendingValue: items.filter(p => p.status === 'pendente').reduce((s, p) => s + parseFloat(p.value || 0), 0),
                paidValue: items.filter(p => p.status === 'pago').reduce((s, p) => s + parseFloat(p.value || 0), 0),
            }
        },

        groupedPayables() {
            const groups = {}
            const today = this.today
            const currentKey = this.currentMonthKey

            this.filteredByStatus.forEach(p => {
                const key = p.dueDate ? moment.utc(p.dueDate).format('YYYY-MM') : 'sem-data'
                if (!groups[key]) groups[key] = []
                groups[key].push(p)
            })

            const result = Object.keys(groups)
                .sort((a, b) => {
                    if (a === currentKey) return -1
                    if (b === currentKey) return 1
                    if (a === 'sem-data') return 1
                    if (b === 'sem-data') return -1
                    const aFuture = a > currentKey, bFuture = b > currentKey
                    if (aFuture && !bFuture) return -1
                    if (!aFuture && bFuture) return 1
                    return a.localeCompare(b)
                })
                .map(key => {
                    const col = this.sortColumn
                    const dir = this.sortDir === 'asc' ? 1 : -1

                    const sortedItems = groups[key].slice().sort((a, b) => {
                        let va, vb
                        switch (col) {
                            case 'value': va = parseFloat(a.value || 0); vb = parseFloat(b.value || 0); break
                            case 'description': va = (a.description || '').toLowerCase(); vb = (b.description || '').toLowerCase(); break
                            case 'supplier': va = (a.Supplier?.name || '').toLowerCase(); vb = (b.Supplier?.name || '').toLowerCase(); break
                            case 'costCenter': va = (a.CostCenter?.name || '').toLowerCase(); vb = (b.CostCenter?.name || '').toLowerCase(); break
                            case 'status': va = a.status || ''; vb = b.status || ''; break
                            case 'paymentDate': va = a.paymentDate || ''; vb = b.paymentDate || ''; break
                            default: va = a.dueDate || ''; vb = b.dueDate || ''
                        }
                        if (va < vb) return -dir
                        if (va > vb) return dir
                        return 0
                    })

                    const page = this.monthCurrentPage[key] || 1
                    const totalPages = Math.ceil(sortedItems.length / PAGE_SIZE)
                    const pageItems = sortedItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

                    const isPast = key < currentKey
                    const isCurrent = key === currentKey
                    const hasOverdue = sortedItems.some(
                        p => p.status === 'pendente' && p.dueDate && moment.utc(p.dueDate).isBefore(today)
                    )
                    const pendingTotal = sortedItems
                        .filter(p => p.status === 'pendente')
                        .reduce((s, p) => s + parseFloat(p.value || 0), 0)
                    const label = monthLabel(key)

                    return {
                        monthKey: key, monthLabel: label, items: pageItems,
                        totalItems: sortedItems.length, currentPage: page, totalPages,
                        isPast, isCurrent, hasOverdue, pendingTotal,
                    }
                })

            return this.showPastMonths ? result : result.filter(g => !g.isPast || g.hasOverdue)
        },

        chartData() {
            const monthTotals = {}
            this.payables.filter(p => p.status === 'pendente' && p.dueDate).forEach(p => {
                const key = moment.utc(p.dueDate).format('YYYY-MM')
                monthTotals[key] = (monthTotals[key] || 0) + parseFloat(p.value || 0)
            })
            const keys = Object.keys(monthTotals).sort()
            const cur = this.currentMonthKey
            return {
                labels: keys.map(k => monthShort(k)),
                values: keys.map(k => monthTotals[k]),
                colors: keys.map(k => k === cur ? '#0d6efd' : '#6c757d'),
            }
        },

        historyChartData() {
            const monthTotals = {}
            this.payables.filter(p => p.status === 'pago' && p.paymentDate).forEach(p => {
                const key = moment.utc(p.paymentDate).format('YYYY-MM')
                monthTotals[key] = (monthTotals[key] || 0) + parseFloat(p.value || 0)
            })
            const keys = Object.keys(monthTotals).sort()
            const cur = this.currentMonthKey
            return {
                labels: keys.map(k => monthShort(k)),
                values: keys.map(k => monthTotals[k]),
                colors: keys.map(k => k === cur ? '#198754' : '#20c997'),
            }
        },
    },

    methods: {
        // ── Sort ──────────────────────────────────────────────────────────────
        toggleSort(col) {
            if (this.sortColumn === col) {
                this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'
            } else {
                this.sortColumn = col
                this.sortDir = 'asc'
            }
        },
        sortIcon(col) {
            if (this.sortColumn !== col) return 'fa-sort'
            return this.sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down'
        },

        // ── Pagination ────────────────────────────────────────────────────────
        setPage(monthKey, page) {
            this.$set(this.monthCurrentPage, monthKey, page)
        },

        // ── Loading ───────────────────────────────────────────────────────────
        buildQuery(extra = {}) {
            const params = { ...extra }
            if (this.filterStart) params.startDate = moment(this.filterStart, 'YYYY-MM').startOf('month').format('YYYY-MM-DD')
            if (this.filterEnd) params.endDate = moment(this.filterEnd, 'YYYY-MM').endOf('month').format('YYYY-MM-DD')
            if (this.filterSupplier) params.supplier = this.filterSupplier
            if (this.filterCostCenterServer) params.costCenter = this.filterCostCenterServer
            const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
            return qs ? '?' + qs : ''
        },

        async loadInitial() {
            this.progressiveStart = moment().subtract(MONTHS_PER_LOAD, 'months').startOf('month')
            const startDate = this.progressiveStart.format('YYYY-MM-DD')
            const { data } = await __api__.get(`/api/payables?startDate=${startDate}`)
            this.payables = data
            this.hasMore = true
            this.renderChart()
        },

        async loadMore() {
            if (this.loadingMore || !this.hasMore) return
            this.loadingMore = true
            try {
                const endDate = this.progressiveStart.clone().subtract(1, 'day').format('YYYY-MM-DD')
                const newStart = this.progressiveStart.clone().subtract(MONTHS_PER_LOAD, 'months')
                const { data } = await __api__.get(
                    `/api/payables?startDate=${newStart.format('YYYY-MM-DD')}&endDate=${endDate}`
                )
                if (!data.length) { this.hasMore = false }
                else {
                    this.payables = [...this.payables, ...data]
                    this.progressiveStart = newStart
                    this.renderChart()
                }
            } catch (e) { console.error(e) }
            finally { this.loadingMore = false }
        },

        async applyFilters() {
            this.isFilterMode = true
            try {
                const { data } = await __api__.get('/api/payables' + this.buildQuery())
                this.payables = data
                this.monthCurrentPage = {}
                this.renderChart()
            } catch (e) {
                alert(e.response?.data?.message || 'Erro ao buscar contas.')
            }
        },

        async clearFilters() {
            this.filterStart = ''
            this.filterEnd = ''
            this.filterSupplier = ''
            this.filterCostCenterServer = ''
            this.filterDesc = ''
            this.filterStatus = 'todos'
            this.filterCostCenter = ''
            this.isFilterMode = false
            this.monthCurrentPage = {}
            await this.loadInitial()
        },

        // ── Row styling ───────────────────────────────────────────────────────
        statusClass(p) {
            switch (p.status) {
                case 'pago': return 'success'
                case 'pendente': return 'primary'
                case 'atrasado': return 'danger'
                case 'cancelado': return 'secondary'
                default: return 'light'
            }
        },

        rowClass(p) {
            const today = this.today
            const threeDays = this.threeDaysFromNow
            if (p.status === 'pago' || p.status === 'cancelado') return 'table-light text-muted'
            if (p.status === 'atrasado' || (p.status === 'pendente' && p.dueDate && moment.utc(p.dueDate).isBefore(today))) return 'table-danger'
            if (p.status === 'pendente' && p.dueDate && moment.utc(p.dueDate).isSameOrBefore(threeDays)) return 'table-warning'
            return ''
        },

        // ── Payment modal ─────────────────────────────────────────────────────
        openPayModal(payable) {
            this.payModal.payable = payable
            this.payModal.value = payable.value
            this.payModal.paymentDate = moment().format('YYYY-MM-DD')
            this.payModal.BankAccountId = ''
            if (!_payModalBS) _payModalBS = new bootstrap.Modal(document.getElementById('payModal'))
            _payModalBS.show()
        },

        async confirmPayment() {
            if (!this.payModal.BankAccountId) { alert('Selecione a conta bancária.'); return }
            if (!this.payModal.paymentDate) { alert('Informe a data de pagamento.'); return }
            this.paying = true
            try {
                await __api__.put(`/api/payables/${this.payModal.payable.id}`, {
                    status: 'pago',
                    paymentDate: this.payModal.paymentDate,
                    value: this.payModal.value,
                    BankAccountId: this.payModal.BankAccountId,
                })
                const bankAccount = this.bankAccounts.find(b => b.id == this.payModal.BankAccountId)
                const idx = this.payables.findIndex(p => p.id === this.payModal.payable.id)
                if (idx >= 0) {
                    this.$set(this.payables, idx, {
                        ...this.payables[idx],
                        status: 'pago',
                        paymentDate: this.payModal.paymentDate,
                        value: this.payModal.value,
                        BankAccountId: this.payModal.BankAccountId,
                        BankAccount: bankAccount || this.payables[idx].BankAccount,
                    })
                }
                _payModalBS.hide()
                this.renderChart()
            } catch (e) {
                alert(e.response?.data?.message || 'Erro ao registrar pagamento.')
                console.error(e)
            } finally {
                this.paying = false
            }
        },

        // ── Export CSV ────────────────────────────────────────────────────────
        exportCSV() {
            const headers = ['#', 'Descrição', 'Fornecedor', 'Centro de Custo', 'Valor', 'Vencimento', 'Data Pagamento', 'Status', 'Recorrência']
            const rows = this.filteredByStatus.map(p => [
                p.id,
                p.description || '',
                p.Supplier?.name || '',
                p.CostCenter?.name || '',
                parseFloat(p.value || 0).toFixed(2).replace('.', ','),
                p.dueDate ? moment.utc(p.dueDate).format('DD/MM/YYYY') : '',
                p.paymentDate ? moment.utc(p.paymentDate).format('DD/MM/YYYY') : '',
                p.status || '',
                p.recurrence || '',
            ])
            const csv = [headers, ...rows]
                .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
                .join('\n')
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `contas_a_pagar_${moment().format('YYYY-MM-DD')}.csv`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        },

        // ── Charts ────────────────────────────────────────────────────────────
        renderChart() {
            if (chartInstance) { chartInstance.destroy(); chartInstance = null }
            if (historyChartInstance) { historyChartInstance.destroy(); historyChartInstance = null }

            const predicted = this.chartData
            const history = this.historyChartData

            this.chartReady = predicted.labels.length > 0 || history.labels.length > 0
            if (!this.chartReady) return

            this.$nextTick(() => {
                const chartOptions = (label) => ({
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label(c) { return ` R$ ${c.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` } } },
                    },
                    scales: { y: { ticks: { callback(v) { return 'R$ ' + v.toLocaleString('pt-BR') } } } },
                })

                const ctxP = document.getElementById('payablesChart')
                if (ctxP && predicted.labels.length) {
                    chartInstance = new Chart(ctxP.getContext('2d'), {
                        type: 'bar',
                        data: { labels: predicted.labels, datasets: [{ label: 'Previsto', data: predicted.values, backgroundColor: predicted.colors }] },
                        options: chartOptions('Previsto'),
                    })
                }

                const ctxH = document.getElementById('historyChart')
                if (ctxH && history.labels.length) {
                    historyChartInstance = new Chart(ctxH.getContext('2d'), {
                        type: 'bar',
                        data: { labels: history.labels, datasets: [{ label: 'Pago', data: history.values, backgroundColor: history.colors }] },
                        options: chartOptions('Pago'),
                    })
                }
            })
        },
    },

    mounted() {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const type = localStorage.getItem('type')
        if (!token || !expires_in || !type) return (location.href = '/')
        if (expires_in <= new Date().valueOf()) return (location.href = '/')

        __api__ = axios.create({ headers: { Authorization: [type, token].join(' ') } })
        __api__.get('/api/auth/verify').catch(() => { localStorage.clear(); location.href = '/' })

        __api__.get('/api/bank-accounts').then(({ data }) => { this.bankAccounts = data }).catch(console.error)

        this.loadInitial().catch(e => {
            alert(e.response?.data?.message || 'Erro ao carregar contas a pagar.')
        })
    },
})
