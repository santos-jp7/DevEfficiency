let __api__ = null

new Vue({
    el: '#app',
    data: {
        id: null,
        tab: 'dados',
        seller: {
            name: '',
            document: '',
            email: '',
            phone: '',
            pix_key: '',
            notes: '',
            active: true,
            commission_percent: 10,
            commission_base: 'liquido',
            applies_to: 'ambos',
            min_protocol_value: null,
            payment_delay_days: 30,
            CostCenterId: null,
        },
        costCenters: [],
        upcoming: { total: 0, overdue: 0, next_30_days: 0, items: [] },
        report: null,
        filter: { startDate: '', endDate: '' },
    },
    methods: Object.assign({}, SellerUI, {
        async save() {
            const url = this.id ? `/api/sellers/${this.id}` : '/api/sellers'

            try {
                const { data } = await __api__[this.id ? 'put' : 'post'](url, this.seller)
                alert('Vendedor salvo com sucesso!')
                if (!this.id) location.href = `./i.html?id=${data.id}`
            } catch (error) {
                alert(error.response?.data?.message || 'Erro ao salvar o vendedor.')
            }
        },
        async remove() {
            if (!confirm('Excluir este vendedor?')) return

            try {
                await __api__.delete(`/api/sellers/${this.id}`)
                location.href = './index.html'
            } catch (error) {
                alert(error.response?.data?.message || 'Erro ao excluir o vendedor.')
            }
        },
        async loadUpcoming() {
            this.upcoming = (await __api__.get(`/api/sellers/${this.id}/upcoming`)).data
        },
        async loadReport() {
            const params = {}
            if (this.filter.startDate) params.startDate = this.filter.startDate
            if (this.filter.endDate) params.endDate = this.filter.endDate

            this.report = (await __api__.get(`/api/sellers/${this.id}/report`, { params })).data
        },
        clearFilter() {
            this.filter = { startDate: '', endDate: '' }
            this.loadReport()
        },
    }),
    async mounted() {
        __api__ = SellerUI.api()
        if (!__api__) return

        const id = new URLSearchParams(location.search).get('id')

        try {
            this.costCenters = (await __api__.get('/api/cost-centers')).data || []

            if (id) {
                this.id = id
                this.seller = Object.assign(this.seller, (await __api__.get(`/api/sellers/${id}`)).data)
                await Promise.all([this.loadUpcoming(), this.loadReport()])
            }
        } catch (error) {
            alert(error.response?.data?.message || 'Ocorreu um erro ao carregar o vendedor.')
        }
    },
})
