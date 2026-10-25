let __api__ = null

new Vue({
    el: '#app',
    data: { tickets: [], q: '', status: new URLSearchParams(location.search).get('needs') === '0' ? '' : 'Aberto,Em análise', page: 1, pages: 1, statuses: TicketUI.statuses, moment },
    methods: {
        color: TicketUI.color,
        async load(page) {
            if (page < 1 || page > this.pages) return
            this.page = page || 1

            try {
                const { data } = await __api__.get('/api/tickets', { params: { q: this.q || undefined, status: this.status || undefined, page: this.page, limit: 20 } })
                this.tickets = data.data
                this.pages = Math.max(Math.ceil(data.total / data.limit), 1)
            } catch (error) {
                TicketUI.fail(error, 'Erro ao buscar os chamados.')
            }
        },
    },
    mounted() {
        __api__ = TicketUI.api()
        if (__api__) this.load(1)
    },
})
