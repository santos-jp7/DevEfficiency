let __api__ = null

const app = new Vue({
    el: '#app',
    data: {
        transactions: [],
        filters: {
            startDate: '',
            endDate: '',
        },
        summary: {
            inflows: 0,
            outflows: 0,
            net: 0,
        },
    },
    methods: {
        formatCurrency(value) {
            if (typeof value !== 'number') {
                return 'R$ 0,00'
            }
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
        },
        formatDate(dateString) {
            if (!dateString) return '-'
            return moment(dateString).format('DD/MM/YYYY')
        },
        processTransactions(transactions) {
            let runningBalance = 0
            let totalInflows = 0
            let totalOutflows = 0

            // API returns newest first, so we reverse to calculate running balance from oldest to newest
            const sortedTx = [...transactions].reverse()

            for (const tx of sortedTx) {
                runningBalance += tx.value
                tx.runningBalance = runningBalance

                if (tx.type === 'inflow' && tx.showInSummary !== false) {
                    totalInflows += tx.value
                }

                if (tx.type === 'outflow' && tx.showInSummary !== false) {
                    totalOutflows += tx.value // value is already negative
                }
            }

            this.summary.inflows = totalInflows
            this.summary.outflows = totalOutflows
            this.summary.net = totalInflows + totalOutflows

            // Reverse back to show newest first in the UI
            this.transactions = sortedTx.reverse()
        },
        async fetchHistory() {
            try {
                const params = new URLSearchParams({
                    startDate: this.filters.startDate,
                    endDate: this.filters.endDate,
                })
                const { data } = await __api__.get(`/api/financial-history?${params.toString()}`)
                this.processTransactions(data)
            } catch (error) {
                console.error(error)
                alert(error.response?.data?.message || 'Ocorreu um erro ao buscar o histórico financeiro.')
            }
        },
        exportToCSV() {
            const headers = ['Data', 'Descricao', 'Relacionado a', 'Tipo', 'Valor']
            const csvRows = [headers.join(',')]

            for (const tx of this.transactions) {
                const values = [
                    this.formatDate(tx.date),
                    `"${tx.description.replace(/"/g, `''`)}"`,
                    `"${tx.relatedTo.replace(/"/g, `''`)}"`,
                    tx.type,
                    tx.value.toFixed(2),
                ]
                csvRows.push(values.join(','))
            }

            const csvString = csvRows.join('\n')
            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
            const link = document.createElement('a')
            const url = URL.createObjectURL(blob)
            link.setAttribute('href', url)
            link.setAttribute('download', 'historico_financeiro.csv')
            link.style.visibility = 'hidden'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        },
        setDefaultFilters() {
            const startOfMonth = moment().startOf('month').format('YYYY-MM-DD')
            const endOfMonth = moment().endOf('month').format('YYYY-MM-DD')
            this.filters.startDate = startOfMonth
            this.filters.endDate = endOfMonth
        },
    },
    mounted: function () {
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

        this.setDefaultFilters()
        this.fetchHistory()
    },
})
