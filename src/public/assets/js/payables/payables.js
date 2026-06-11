let __api__ = null
let chartInstance = null

const app = new Vue({
    el: '#app',
    data: {
        payables: [],
        filterDesc: '',
        filterSupplier: '',
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

        // Summary cards (all payables, not just filtered)
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

        // Filtered payables (search only — grouping handles month filter)
        filtered() {
            return this.payables.filter((p) => {
                const matchDesc = !this.filterDesc || (p.description || '').toLowerCase().includes(this.filterDesc.toLowerCase())
                const matchSupplier =
                    !this.filterSupplier ||
                    (p.Supplier && p.Supplier.name.toLowerCase().includes(this.filterSupplier.toLowerCase()))
                return matchDesc && matchSupplier
            })
        },

        // Group by month (YYYY-MM), sorted ascending
        groupedPayables() {
            const groups = {}
            const today = this.today
            const currentKey = this.currentMonthKey

            this.filtered.forEach((p) => {
                const key = p.dueDate ? moment.utc(p.dueDate).format('YYYY-MM') : 'sem-data'
                if (!groups[key]) groups[key] = []
                groups[key].push(p)
            })

            const currentKey = this.currentMonthKey
            const result = Object.keys(groups)
                .sort((a, b) => {
                    // Current month always first
                    if (a === currentKey) return -1
                    if (b === currentKey) return 1
                    // 'sem-data' always last
                    if (a === 'sem-data') return 1
                    if (b === 'sem-data') return -1
                    // Future months before past months, both in ascending order
                    const aFuture = a > currentKey
                    const bFuture = b > currentKey
                    if (aFuture && !bFuture) return -1
                    if (!aFuture && bFuture) return 1
                    return a.localeCompare(b)
                })
                .map((key) => {
                    const items = groups[key].slice().sort((a, b) => {
                        return moment.utc(a.dueDate).valueOf() - moment.utc(b.dueDate).valueOf()
                    })
                    const isPast = key < currentKey
                    const isCurrent = key === currentKey
                    const hasOverdue = items.some(
                        (p) => p.status === 'pendente' && p.dueDate && moment.utc(p.dueDate).isBefore(today),
                    )
                    const pendingTotal = items
                        .filter((p) => p.status === 'pendente')
                        .reduce((s, p) => s + parseFloat(p.value || 0), 0)
                    const monthLabel =
                        key === 'sem-data'
                            ? 'Sem data definida'
                            : moment(key, 'YYYY-MM').format('MMMM [de] YYYY')

                    return { monthKey: key, monthLabel, items, isPast, isCurrent, hasOverdue, pendingTotal }
                })

            // Filter past months unless toggle is on
            if (!this.showPastMonths) {
                return result.filter((g) => !g.isPast || g.hasOverdue)
            }
            return result
        },

        // Chart data: pending totals by month (sorted)
        chartData() {
            const monthTotals = {}
            this.payables
                .filter((p) => p.status === 'pendente' && p.dueDate)
                .forEach((p) => {
                    const key = moment.utc(p.dueDate).format('YYYY-MM')
                    monthTotals[key] = (monthTotals[key] || 0) + parseFloat(p.value || 0)
                })

            const keys = Object.keys(monthTotals).sort()
            const labels = keys.map((k) => moment(k, 'YYYY-MM').format('MMM/YY'))
            const values = keys.map((k) => monthTotals[k])
            const currentKey = this.currentMonthKey
            const colors = keys.map((k) => (k === currentKey ? '#0d6efd' : '#6c757d'))

            return { labels, values, colors }
        },
    },
    methods: {
        statusClass(p) {
            switch (p.status) {
                case 'pago':
                    return 'success'
                case 'pendente':
                    return 'primary'
                case 'cancelado':
                    return 'secondary'
                default:
                    return 'light'
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
            if (chartInstance) {
                chartInstance.destroy()
                chartInstance = null
            }
            const { labels, values, colors } = this.chartData
            if (!labels.length) return

            this.chartReady = true
            this.$nextTick(() => {
                const ctx = document.getElementById('payablesChart')
                if (!ctx) return
                chartInstance = new Chart(ctx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            {
                                label: 'Gastos Previstos (R$)',
                                data: values,
                                backgroundColor: colors,
                            },
                        ],
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
                            y: {
                                ticks: {
                                    callback(v) {
                                        return 'R$ ' + v.toLocaleString('pt-BR')
                                    },
                                },
                            },
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

        __api__ = axios.create({
            headers: {
                Authorization: [type, token].join(' '),
            },
        })

        __api__.get('/api/auth/verify').catch(() => {
            localStorage.clear()
            location.href = '/'
        })

        __api__
            .get('/api/payables')
            .then(({ data }) => {
                this.payables = data
                this.renderChart()
            })
            .catch((error) => {
                console.error(error)
                alert(error.response?.data?.message || 'Ocorreu um erro ao buscar as contas a pagar.')
            })
    },
})
