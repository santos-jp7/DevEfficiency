let __api__ = null

const emptyColumn = () => ({ items: [], count: 0, value: 0, weighted: 0, has_more: false })

new Vue({
    el: '#app',
    components: { draggable: window.vuedraggable },
    data: {
        Crm: window.Crm,
        loading: false,
        loadingMore: '',
        closedDays: 30,
        staleDays: 7,
        // Funil montado no servidor: cada coluna traz totais e as primeiras oportunidades ("carregar mais" busca o resto).
        columns: Object.fromEntries(window.Crm.STAGES.map((s) => [s, emptyColumn()])),
        sellers: [],
        users: [],
        q: '',
        SellerId: '',
        source: '',
        owner: '',
        lost: { reason: '', details: '' },
        pending: null, // { o, from, to } enquanto o modal de perda está aberto
        lostModal: null,
        searchTimer: null,
    },
    computed: {
        totals() {
            let open = 0
            let weighted = 0
            let overdue = 0
            let stale = 0
            for (const s of Crm.OPEN_STAGES) {
                open += this.col(s).value
                weighted += this.col(s).weighted
                for (const o of this.col(s).items) {
                    if (o.next_followup && Crm.isOverdue(o.next_followup.due_at)) overdue++
                    if (o.stale) stale++
                }
            }
            return { open, weighted, overdue, stale }
        },
    },
    watch: {
        SellerId: 'load',
        source: 'load',
        owner: 'load',
        q() {
            clearTimeout(this.searchTimer)
            this.searchTimer = setTimeout(() => this.load(), 350)
        },
    },
    methods: {
        col(stage) {
            return this.columns[stage] || emptyColumn()
        },
        filters() {
            const params = { closedDays: this.closedDays }
            if (this.q) params.q = this.q
            if (this.SellerId) params.SellerId = this.SellerId
            if (this.source) params.source = this.source
            if (this.owner === 'mine') params.mine = 1
            else if (this.owner) params.UserId = this.owner
            return params
        },
        async load() {
            this.loading = true
            try {
                const { data } = await __api__.get('/api/crm/board', { params: this.filters() })
                this.columns = Object.fromEntries(Crm.STAGES.map((s) => [s, data.columns[s] || emptyColumn()]))
                this.staleDays = data.stale_days
            } catch (e) {
                alert(Crm.errorMessage(e, 'Não foi possível carregar o funil.'))
            } finally {
                this.loading = false
            }
        },
        async loadMore(stage) {
            this.loadingMore = stage
            try {
                const column = this.col(stage)
                const { data } = await __api__.get('/api/crm/board', { params: { ...this.filters(), stage, offset: column.items.length } })
                const more = data.columns[stage]
                column.items.push(...more.items.filter((o) => !column.items.some((x) => x.id === o.id)))
                column.has_more = more.has_more
            } finally {
                this.loadingMore = ''
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
                if (stage === 'Ganho' && o.SourceServiceOrderId && !o.ServiceOrderId) {
                    // Veio de uma OS: ganhar é seguir com a própria OS (vai para a fila).
                    if (!confirm(`Ganhar "${o.title}"? A OS #${o.SourceServiceOrderId} vai para "Na fila".`)) return this.load()
                } else if (stage === 'Ganho' && !(o.ServiceOrderId || o.ProtocolId)) return this.$refs.win.open(o)

                // Etapa aberta sem follow-up pendente: pede o próximo passo (ou "agora não").
                let extra = {}
                if (Crm.OPEN_STAGES.includes(stage) && !o.next_followup) {
                    const answer = await this.$refs.followup.ask(o, stage)
                    if (answer === null) return this.load()
                    extra = answer
                }
                await this.saveStage(o, stage, { position: event.added.newIndex, ...extra })
            } else if (event.moved) {
                await this.saveOrder(stage)
            }
        },
        async saveStage(o, stage, extra = {}) {
            try {
                const { data } = await __api__.patch(`/api/crm/opportunities/${o.id}/stage`, { stage, ...extra })
                if (data.warning) alert(data.warning)
                await this.saveOrder(stage)
            } catch (e) {
                alert(Crm.errorMessage(e, 'Não foi possível mover a oportunidade.'))
            }
            // Recarrega para os totais e contagens de cada coluna (calculados no servidor).
            await this.load()
        },
        async saveOrder(stage) {
            const ids = this.col(stage).items.map((o) => o.id)
            await __api__.post('/api/crm/opportunities/reorder', { ids }).catch(() => {})
        },
        async onWon(result) {
            await this.load()
            const links = [
                result.created_client ? `Cliente #${result.ClientId} criado.` : '',
                result.ServiceOrderId ? `OS #${result.ServiceOrderId} aberta.` : '',
                result.ProtocolId && !result.ServiceOrderId ? `Protocolo #${result.ProtocolId} lançado.` : '',
            ].filter(Boolean)
            const target = result.ServiceOrderId
                ? `/service_orders/i?id=${result.ServiceOrderId}`
                : result.BillingId
                ? `/billings/i.html?id=${result.BillingId}`
                : result.ProtocolId
                ? `/protocols/i.html?id=${result.ProtocolId}`
                : null
            if (target && confirm(`Oportunidade ganha! ${links.join(' ')}\n\nAbrir agora?`)) location.href = target
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
        __api__.get('/api/crm/users').then(({ data }) => (this.users = data || [])).catch(() => {})
        this.load()
    },
})
