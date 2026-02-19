let __api__ = null

const dreReport = new Vue({
    el: '#dre-report',
    data: {
        filter: {
            month: moment().month() + 1,
            year: moment().year(),
        },
        months: [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ],
        report: {
            revenue: 0,
            directCosts: {
                productCosts: 0,
                serviceExpenses: 0,
            },
            operatingExpenses: {
                total: 0,
                byCostCenter: [],
            },
            grossProfit: 0,
            netResult: 0,
        },
    },
    filters: {
        currency(value) {
            if (typeof value !== 'number') return 'R$ 0,00'
            return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        },
    },
    methods: {
        async fetchData() {
            try {
                const { data } = await __api__.get(`/api/dre-report?month=${this.filter.month}&year=${this.filter.year}`)
                this.report = data
            } catch (error) {
                console.error('Error fetching DRE data:', error)
                alert('Ocorreu um erro ao carregar o relatório.')
            }
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

        this.fetchData()
    },
})
