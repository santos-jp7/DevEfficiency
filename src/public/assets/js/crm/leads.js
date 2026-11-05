new Vue({
    el: '#app',
    data: { Crm: window.Crm, leads: [], q: '', status: 'Ativo', source: '' },
    computed: {
        filtered() {
            const q = this.q.toLowerCase()
            return this.leads.filter((l) => {
                if (this.status && l.status !== this.status) return false
                if (this.source && l.source !== this.source) return false
                if (!q) return true
                return [l.name, l.company, l.email, l.phone, l.whatsapp, l.document].filter(Boolean).join(' ').toLowerCase().includes(q)
            })
        },
    },
    methods: {
        open(l) {
            return (l.Opportunities || []).filter((o) => Crm.OPEN_STAGES.includes(o.stage))
        },
        openCount(l) {
            return this.open(l).length
        },
        openValue(l) {
            return this.open(l).reduce((s, o) => s + (Number(o.estimated_value) || 0), 0)
        },
    },
    mounted() {
        const api = Crm.api()
        if (!api) return
        api.get('/api/crm/leads')
            .then(({ data }) => (this.leads = data))
            .catch((e) => alert(Crm.errorMessage(e, 'Não foi possível carregar os leads.')))
    },
})
