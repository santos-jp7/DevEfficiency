let __api__ = null

const app = new Vue({
    el: '#billings',
    data: {
        billings: [],
        allBillings: [],
        q: '',
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

        __api__.get('/api/billings').then((res) => {
            this.billings = res.data
            this.allBillings = res.data
        })
    },
    methods: {
        handlerSearch() {
            this.billings = this.allBillings.filter((billing) => {
                return billing.Client.name.toLowerCase().includes(this.q.toLowerCase())
            })
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
