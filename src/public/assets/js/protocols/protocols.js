const app = new Vue({
    el: '#protocols',
    data: {
        protocols: [],
        allProtocols: [],
        q: '',
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
    },
    mounted() {
        this.fetchProtocols()
    },
    methods: {
        fetchProtocols() {
            axios
                .get(`/api/protocols?page=${this.page}&limit=${this.limit}`, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('token')}`,
                    },
                })
                .then((res) => {
                    this.protocols = res.data.data
                    this.allProtocols = res.data.data
                    this.total = res.data.total
                    this.totalPages = Math.ceil(this.total / this.limit)
                })
        },
        handlerSearch() {
            this.protocols = this.allProtocols.filter((protocol) => {
                const clientName = protocol.Service_order
                    ? protocol.Service_order.Client.name
                    : protocol.Subscription.Client.name
                return clientName.toLowerCase().includes(this.q.toLowerCase())
            })
        },
        formatDate(date) {
            return moment(date).format('DD/MM/YYYY')
        },
        statusColor(status) {
            switch (status) {
                case 'Em aberto':
                    return 'primary'
                case 'Liberado para pagamento':
                    return 'info'
                case 'Fechado':
                    return 'success'
                case 'Cancelado':
                    return 'danger'
                case 'pago':
                    return 'success'
                default:
                    return 'secondary'
            }
        },
        prevPage() {
            if (this.page > 1) {
                this.page--
                this.fetchProtocols()
            }
        },
        nextPage() {
            if (this.page < this.totalPages) {
                this.page++
                this.fetchProtocols()
            }
        },
    },
})
