let __api__ = null

const app = new Vue({
    el: '#billings',
    data: {
        billings: [],
        allBillings: [],
        q: '',
        startDate: '',
        endDate: '',
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

        __api__.get('/api/auth/verify').catch((error) => {
            console.log(error)

            localStorage.clear()

            location.href = '/'
        })

        const today = new Date()
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)

        this.startDate = moment(firstDay).format('YYYY-MM-DD')
        this.endDate = moment(lastDay).format('YYYY-MM-DD')

        __api__.get(`/api/billings?startDate=${this.startDate}&endDate=${this.endDate}`).then((res) => {
            this.allBillings = res.data
            this.handlerSearch()
        })
    },
    methods: {

        handlerSearch() {
            if (this.startDate && this.endDate) {
                __api__.get(`/api/billings?startDate=${this.startDate}&endDate=${this.endDate}`).then((res) => {
                    this.allBillings = res.data
                    let filteredBillings = this.allBillings.filter((billing) => {
                        return billing.Client.name.toLowerCase().includes(this.q.toLowerCase())
                    })
                    this.billings = filteredBillings
                })
            } else {
                let filteredBillings = this.allBillings.filter((billing) => {
                    return billing.Client.name.toLowerCase().includes(this.q.toLowerCase())
                })
                this.billings = filteredBillings
            }
        },
        formatCurrency(value) {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
        },
        formatDate(date) {
            return moment(date).format('DD/MM/YYYY')
        },
        statusColor(status) {
            switch (status) {
                case 'pendente':
                    return 'warning'
                case 'pago':
                    return 'success'
                case 'cancelado':
                    return 'danger'
                default:
                    return 'secondary'
            }
        },
    },
})
