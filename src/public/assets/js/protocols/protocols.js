const app = new Vue({
    el: '#protocols',
    data: {
        protocols: [],
        allProtocols: [],
        q: '',
    },
    mounted() {
        axios
            .get('/api/protocols', {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
            })
            .then((res) => {
                this.protocols = res.data
                this.allProtocols = res.data
            })
    },
    methods: {
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
    },
})
