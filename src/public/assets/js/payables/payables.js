let __api__ = null
let chartInstance = null
const MONTHS_PER_LOAD = 3

const app = new Vue({
    el: '#app',
    data: {
        payables: [],

        // Progressive loading state
        progressiveStart: null, // moment: earliest date loaded in progressive mode
        isFilterMode: false,
        loadingMore: false,
        hasMore: true,

        // Filters (applied via "Buscar" button)
        filterStart: '',     // YYYY-MM from month picker
        filterEnd: '',       // YYYY-MM from month picker
        filterSupplier: '',  // text search, server-side

        // Client-side only (instant, no server call)
        filterDesc: '',

        showPastMonths: true,
        chartReady: false,
    },
    filters: {
        currency(value) {
            if (typeof value !== 'number' && isNaN(parseFloat(value))) return 'R$ 0,00'
            return parseFloat(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        },
        date(value) {
            if (!value) return '-'
            return moment.utc(value).format('DD/MM/YYYY')
        },
    },
    computed: {
        today() {
            return moment().startOf('day')
        },
        threeDaysFromNow() {
            return moment().startOf('day').add(3, 'days')
        },
        currentMonthKey() {
            return moment().format('YYYY-MM')
        },
        hasActiveFilters() {
            return this.filterStart || this.filterEnd || this.filterSupplier
        },

        // Summary cards — computed from all loaded payables (not filtered by description)
        summary() {
            const today = this.today
            const threeDays = this.threeDaysFromNow
            const firstDayMonth = moment().startOf('month')
            const lastDayMonth = moment().endOf('month')

            const pending = this.payables.filter((p) => p.status === 'pendente')
            const overdue = pending.filter((p) => p.dueDate && moment.utc(p.dueDate).isBefore(today))
            const upcoming = pending.filter((p) => {
                const due = moment.utc(p.dueDate)
                return p.dueDate && !due.isBefore(today) && due.isSameOrBefore(threeDays)
            })
            const paidMonth = this.payables.filter(
                (p) =>
                    p.status === 'pago' &&
                    p.paymentDate &&
                    moment.utc(p.paymentDate).isBetween(firstDayMonth, lastDayMonth, 'day', '[]'),
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

        // Description filter applied on top of loaded payables
        filtered() {
            if (!this.filterDesc) return this.payables
            const q = this.filterDesc.toLowerCase()
            return this.payables.filter((p) => (p.description || '').toLowerCase().includes(q))
        },

        // Group filtered payables by month, sorted: current → future → past
        groupedPayables() {
            const groups = {}
            const today = this.today
            const currentKey = this.currentMonthKey

            this.filtered.forEach((p) => {
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
                    const aFuture = a > currentKey
                    const bFuture = b > currentKey
                    if (aFuture && !bFuture) return -1
                    if (!aFuture && bFuture) return 1
                    return a.localeCompare(b)
                })
                .map((key) => {
                    const items = groups[key].slice().sort((a, b) =>
                        moment.utc(a.dueDate).valueOf() - moment.utc(b.dueDate).valueOf(),
                    )
                    const isPast = key < currentKey
                    const isCurrent = key === currentKey
                    const hasOverdue = items.some(
                        (p) => p.status === 'pendente' && p.dueDate && moment.utc(p.dueDate).isBefore(today),
                    )
                    const pendingTotal = items
                        .filter((p) => p.status === 'pendente')
                        .reduce((s, p) => s + parseFloat(p.value || 0), 0)
                    const monthLabel =
                        key === 'sem-data' ? 'Sem data definida' : moment(key, 'YYYY-MM').format('MMMM [de] YYYY')

                    return { monthKey: key, monthLabel, items, isPast, isCurrent, hasOverdue, pendingTotal }
                })

            if (!this.showPastMonths) {
                return result.filter((g) => !g.isPast || g.hasOverdue)
            }
            return result
        },

        // Chart data: pending totals per month from loaded payables
        chartData() {
            const monthTotals = {}
            this.payables
                .filter((p) => p.status === 'pendente' && p.dueDate)
                .forEach((p) => {
                    const key = moment.utc(p.dueDate).format('YYYY-MM')
                    monthTotals[key] = (monthTotals[key] || 0) + parseFloat(p.value || 0)
                })

            const keys = Object.keys(monthTotals).sort()
            const currentKey = this.currentMonthKey
            return {
                labels: keys.map((k) => moment(k, 'YYYY-MM').format('MMM/YY')),
                values: keys.map((k) => monthTotals[k]),
                colors: keys.map((k) => (k === currentKey ? '#0d6efd' : '#6c757d')),
            }
        },
    },
    methods: {
        // Build query string from active filters (date + supplier)
        buildQuery(extra = {}) {
            const params = { ...extra }
            if (this.filterStart) params.startDate = moment(this.filterStart, 'YYYY-MM').startOf('month').format('YYYY-MM-DD')
            if (this.filterEnd) params.endDate = moment(this.filterEnd, 'YYYY-MM').endOf('month').format('YYYY-MM-DD')
            if (this.filterSupplier) params.supplier = this.filterSupplier
            const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
            return qs ? '?' + qs : ''
        },

        // Load initial chunk: from MONTHS_PER_LOAD months ago to future (no endDate)
        async loadInitial() {
            this.progressiveStart = moment().subtract(MONTHS_PER_LOAD, 'months').startOf('month')
            const startDate = this.progressiveStart.format('YYYY-MM-DD')
            const { data } = await __api__.get(`/api/payables?startDate=${startDate}`)
            this.payables = data
            this.hasMore = true
            this.renderChart()
        },

        // Load 3 more past months and prepend to list
        async loadMore() {
            if (this.loadingMore || !this.hasMore) return
            this.loadingMore = true
            try {
                const endDate = this.progressiveStart.clone().subtract(1, 'day').format('YYYY-MM-DD')
                const newStart = this.progressiveStart.clone().subtract(MONTHS_PER_LOAD, 'months')
                const startDate = newStart.format('YYYY-MM-DD')

                const { data } = await __api__.get(`/api/payables?startDate=${startDate}&endDate=${endDate}`)
                if (data.length === 0) {
                    this.hasMore = false
                } else {
                    this.payables = [...this.payables, ...data]
                    this.progressiveStart = newStart
                    this.renderChart()
                }
            } catch (err) {
                console.error(err)
            } finally {
                this.loadingMore = false
            }
        },

        // Apply server-side filters (date range + supplier) — replaces list
        async applyFilters() {
            this.isFilterMode = true
            try {
                const { data } = await __api__.get('/api/payables' + this.buildQuery())
                this.payables = data
                this.renderChart()
            } catch (err) {
                console.error(err)
                alert(err.response?.data?.message || 'Erro ao buscar contas.')
            }
        },

        // Clear filters and go back to progressive mode
        async clearFilters() {
            this.filterStart = ''
            this.filterEnd = ''
            this.filterSupplier = ''
            this.filterDesc = ''
            this.isFilterMode = false
            await this.loadInitial()
        },

        statusClass(p) {
            switch (p.status) {
                case 'pago': return 'success'
                case 'pendente': return 'primary'
                case 'cancelado': return 'secondary'
                default: return 'light'
            }
        },

        rowClass(p) {
            const today = this.today
            const threeDays = this.threeDaysFromNow
            if (p.status === 'pago' || p.status === 'cancelado') return 'table-light text-muted'
            if (p.status === 'pendente' && p.dueDate && moment.utc(p.dueDate).isBefore(today)) return 'table-danger'
            if (p.status === 'pendente' && p.dueDate && moment.utc(p.dueDate).isSameOrBefore(threeDays)) return 'table-warning'
            return ''
        },

        renderChart() {
            if (chartInstance) { chartInstance.destroy(); chartInstance = null }
            const { labels, values, colors } = this.chartData
            if (!labels.length) { this.chartReady = false; return }

            this.chartReady = true
            this.$nextTick(() => {
                const ctx = document.getElementById('payablesChart')
                if (!ctx) return
                chartInstance = new Chart(ctx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [{ label: 'Gastos Previstos (R$)', data: values, backgroundColor: colors }],
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label(ctx) {
                                        return ' R$ ' + ctx.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                                    },
                                },
                            },
                        },
                        scales: {
                            y: { ticks: { callback(v) { return 'R$ ' + v.toLocaleString('pt-BR') } } },
                        },
                    },
                })
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

        this.loadInitial().catch((err) => {
            console.error(err)
            alert(err.response?.data?.message || 'Erro ao carregar contas a pagar.')
        })
    },
})
