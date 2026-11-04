let __api__ = null

new Vue({
    el: '#app',
    components: { draggable: window.vuedraggable },
    data: {
        Crm: window.Crm,
        loading: false,
        closedDays: 30,
        columns: Object.fromEntries(window.Crm.STAGES.map((s) => [s, []])),
        sellers: [],
        q: '',
        SellerId: '',
        source: '',
        lost: { reason: '', details: '' },
        pending: null, // { o, from, to } enquanto o modal de perda está aberto
        lostModal: null,
    },
    computed: {
        totals() {
            let open = 0
            let weighted = 0
            let overdue = 0
            for (const s of Crm.OPEN_STAGES)
                for (const o of this.visible(s)) {
                    open += Number(o.estimated_value) || 0
                    weighted += ((Number(o.estimated_value) || 0) * (Number(o.probability) || 0)) / 100
                    if (o.next_followup && Crm.isOverdue(o.next_followup.due_at)) overdue++
                }
            return { open, weighted, overdue }
        },
    },
    methods: {
        matches(o) {
            if (this.SellerId && String(o.SellerId) !== String(this.SellerId)) return false
            if (this.source && o.Lead?.source !== this.source) return false
            if (this.q) {
                const q = this.q.toLowerCase()
                const hay = [o.title, o.Lead?.name, o.Lead?.company, o.Client?.name].filter(Boolean).join(' ').toLowerCase()
                if (!hay.includes(q)) return false
            }
            return true
        },
        visible(stage) {
            return this.columns[stage].filter((o) => this.matches(o))
        },
        sum(stage) {
            return this.visible(stage).reduce((s, o) => s + (Number(o.estimated_value) || 0), 0)
        },
        weighted(stage) {
            return this.visible(stage).reduce((s, o) => s + ((Number(o.estimated_value) || 0) * (Number(o.probability) || 0)) / 100, 0)
        },
        async load() {
            this.loading = true
            try {
                const { data } = await __api__.get('/api/crm/opportunities?status=all')
                const since = moment().subtract(this.closedDays, 'days')
                const cols = Object.fromEntries(Crm.STAGES.map((s) => [s, []]))
                for (const o of data) {
                    const closedAt = o.won_at || o.lost_at || o.updatedAt
                    if (!Crm.OPEN_STAGES.includes(o.stage) && moment(closedAt).isBefore(since)) continue
                    if (cols[o.stage]) cols[o.stage].push(o)
                }
                this.columns = cols
            } catch (e) {
                alert(Crm.errorMessage(e, 'Não foi possível carregar o funil.'))
            } finally {
                this.loading = false
            }
        },
        // Oportunidade convertida (OS/protocolo gerado) não sai de Ganho.
        canMove(evt) {
            const o = evt.draggedContext.element
            const to = evt.to.getAttribute('data-stage')
            if ((o.ServiceOrderId || o.ProtocolId) && to !== 'Ganho') return false
            return true
        },
        async onChange(event, stage) {
            if (event.added) {
                const o = event.added.element
                const from = o.stage
                if (stage === 'Perdido') {
                    this.pending = { o, from, to: stage }
                    this.lost = { reason: '', details: '' }
                    this.lostModal.show()
                    return
                }
                if (stage === 'Ganho' && !confirm(`Marcar "${o.title}" como ganha?`)) return this.load()
                await this.saveStage(o, stage, { position: event.added.newIndex })
            } else if (event.moved) {
                await this.saveOrder(stage)
            }
        },
        async saveStage(o, stage, extra = {}) {
            try {
                const { data } = await __api__.patch(`/api/crm/opportunities/${o.id}/stage`, { stage, ...extra })
                Object.assign(o, data)
                await this.saveOrder(stage)
            } catch (e) {
                alert(Crm.errorMessage(e, 'Não foi possível mover a oportunidade.'))
                this.load()
            }
        },
        async saveOrder(stage) {
            const ids = this.columns[stage].map((o) => o.id)
            await __api__.post('/api/crm/opportunities/reorder', { ids }).catch(() => {})
        },
        async confirmLost() {
            const { o } = this.pending
            this.lostModal.hide()
            await this.saveStage(o, 'Perdido', { lost_reason: this.lost.reason, lost_details: this.lost.details })
            this.pending = null
        },
        cancelPending() {
            this.lostModal.hide()
            this.pending = null
            this.load()
        },
    },
    mounted() {
        __api__ = Crm.api()
        if (!__api__) return
        this.lostModal = new bootstrap.Modal(document.getElementById('lostModal'), { backdrop: 'static' })
        __api__.get('/api/sellers').then(({ data }) => (this.sellers = (data || []).filter((s) => s.active))).catch(() => {})
        this.load()
    },
})
