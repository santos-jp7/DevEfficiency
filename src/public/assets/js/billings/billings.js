let __api__ = null

const app = new Vue({
    el: '#billings',
    filters: {
        date(v) {
            return v ? moment(v).format('DD/MM/YYYY') : '—'
        },
    },
    data: {
        allBillings: [],
        billings: [],
        q: '',
        startDate: '',
        endDate: '',
        activeStatus: '',
        statusOptions: [
            { value: '', label: 'Todos' },
            { value: 'pendente', label: 'Pendente' },
            { value: 'faturada', label: 'Faturada' },
            { value: 'pago', label: 'Pago' },
            { value: 'cancelado', label: 'Cancelado' },
        ],
    },
    computed: {
        metrics() {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            return {
                pendente: this.allBillings
                    .filter((b) => b.status === 'pendente')
                    .reduce((s, b) => s + parseFloat(b.total_value || 0), 0),
                faturada: this.allBillings
                    .filter((b) => b.status === 'faturada')
                    .reduce((s, b) => s + parseFloat(b.total_value || 0), 0),
                pago: this.allBillings
                    .filter((b) => b.status === 'pago')
                    .reduce((s, b) => s + parseFloat(b.total_value || 0), 0),
                atrasado: this.allBillings
                    .filter((b) => b.status === 'pendente' && b.due_date && new Date(b.due_date) < today)
                    .reduce((s, b) => s + parseFloat(b.total_value || 0), 0),
            }
        },
        counts() {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            return {
                pendente: this.allBillings.filter((b) => b.status === 'pendente').length,
                faturada: this.allBillings.filter((b) => b.status === 'faturada').length,
                pago: this.allBillings.filter((b) => b.status === 'pago').length,
                cancelado: this.allBillings.filter((b) => b.status === 'cancelado').length,
                atrasado: this.allBillings.filter(
                    (b) => b.status === 'pendente' && b.due_date && new Date(b.due_date) < today,
                ).length,
            }
        },
        filteredTotal() {
            return this.billings.reduce((s, b) => s + parseFloat(b.total_value || 0), 0)
        },
    },
    methods: {
        async handlerSearch() {
            if (!this.startDate || !this.endDate) return
            try {
                const { data } = await __api__.get(`/api/billings?startDate=${this.startDate}&endDate=${this.endDate}`)
                this.allBillings = data
                this.applyFilters()
            } catch (e) {
                console.error(e)
            }
        },
        applyFilters() {
            let result = this.allBillings
            if (this.activeStatus) {
                result = result.filter((b) => b.status === this.activeStatus)
            }
            if (this.q) {
                const q = this.q.toLowerCase()
                result = result.filter((b) => b.Client?.name?.toLowerCase().includes(q))
            }
            this.billings = result
        },
        setStatus(status) {
            this.activeStatus = status
            this.applyFilters()
        },
        isOverdue(billing) {
            if (billing.status !== 'pendente' || !billing.due_date) return false
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            return new Date(billing.due_date) < today
        },
        overdueDays(billing) {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            return Math.floor((today - new Date(billing.due_date)) / 86400000)
        },
        rowClass(billing) {
            if (this.isOverdue(billing)) return 'table-danger'
            return ''
        },
        statusBadge(status) {
            const map = {
                pendente: 'bg-warning text-dark',
                faturada: 'bg-primary',
                pago: 'bg-success',
                cancelado: 'bg-danger',
            }
            return map[status] || 'bg-secondary'
        },
        formatCurrency(value) {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
        },
        formatDate(date) {
            return moment(date).format('DD/MM/YYYY')
        },
    },
    mounted() {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const type = localStorage.getItem('type')

        if (!token || !expires_in || !type) return (location.href = '/')
        if (expires_in <= new Date().valueOf()) return (location.href = '/')

        __api__ = axios.create({
            headers: { Authorization: [type, token].join(' ') },
        })

        __api__.get('/api/auth/verify').catch(() => {
            localStorage.clear()
            location.href = '/'
        })

        const today = new Date()
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        this.startDate = moment(firstDay).format('YYYY-MM-DD')
        this.endDate = moment(lastDay).format('YYYY-MM-DD')

        this.handlerSearch()
    },
})
