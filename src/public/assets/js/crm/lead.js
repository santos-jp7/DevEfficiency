let __api__ = null

const emptyLead = () => ({ name: '', company: '', document: '', email: '', phone: '', whatsapp: '', source: 'Indicação', status: 'Ativo', notes: '', ClientId: null, SellerId: null, UserId: Crm.currentUserId() })
const emptyActivity = () => ({ type: 'Ligação', subject: '', due_at: '' })

new Vue({
    el: '#app',
    data: { Crm: window.Crm, isNew: true, busy: false, lookup: false, lead: emptyLead(), clients: [], sellers: [], users: [], activity: emptyActivity(), matches: { clients: [], leads: [] } },
    computed: {
        activities() {
            return [...(this.lead.CrmActivities || [])].sort((a, b) => {
                if (!a.done_at !== !b.done_at) return a.done_at ? 1 : -1
                return new Date(b.due_at || b.createdAt) - new Date(a.due_at || a.createdAt)
            })
        },
    },
    methods: {
        async load(id) {
            const { data } = await __api__.get('/api/crm/leads/' + id)
            // A lista do lead não traz o título da oportunidade em cada atividade; completa pelo id.
            const byId = new Map((data.Opportunities || []).map((o) => [o.id, o]))
            for (const a of data.CrmActivities || []) if (a.OpportunityId) a.Opportunity = byId.get(a.OpportunityId) || null
            this.lead = data
            this.isNew = false
        },
        payload() {
            const { name, company, document, email, phone, whatsapp, source, status, notes, ClientId, SellerId, UserId } = this.lead
            return {
                name, company, document, email, phone, whatsapp, source, status, notes,
                ClientId: ClientId || null,
                SellerId: SellerId || null,
                ...(this.users.length > 1 ? { UserId: UserId || null } : {}),
            }
        },
        // Possíveis duplicados (mesmo CNPJ/CPF, e-mail ou telefone) entre clientes e outros leads.
        async checkDuplicates() {
            const { document, email, phone, whatsapp } = this.lead
            const params = { document, email, phone, whatsapp }
            if (!this.isNew) params.exclude = this.lead.id
            const { data } = await __api__.get('/api/crm/leads/check', { params })
            this.matches = data
            return data
        },
        async save() {
            this.busy = true
            try {
                const dup = await this.checkDuplicates().catch(() => ({ clients: [], leads: [] }))
                const lines = [
                    ...dup.clients.map((c) => `Cliente "${c.name}" (mesmo ${c.reason})`),
                    ...dup.leads.map((l) => `Lead "${l.company || l.name}" (mesmo ${l.reason}, ${l.status})`),
                ]
                if (this.isNew && lines.length && !confirm('Possível duplicado:\n- ' + lines.join('\n- ') + '\n\nCadastrar mesmo assim?')) return
                if (this.isNew) {
                    const { data } = await __api__.post('/api/crm/leads', this.payload())
                    location.href = '/crm/lead.html?id=' + data.id
                    return
                }
                await __api__.put('/api/crm/leads/' + this.lead.id, this.payload())
                await this.load(this.lead.id)
            } catch (e) {
                alert(Crm.errorMessage(e, 'Não foi possível salvar o lead.'))
            } finally {
                this.busy = false
            }
        },
        async remove() {
            if (!confirm('Excluir este lead?')) return
            try {
                await __api__.delete('/api/crm/leads/' + this.lead.id)
                location.href = '/crm/leads.html'
            } catch (e) {
                alert(Crm.errorMessage(e, 'Não foi possível excluir.'))
            }
        },
        async lookupCnpj() {
            const raw = (this.lead.document || '').replace(/\D/g, '')
            if (raw.length !== 14) return alert('Informe um CNPJ com 14 dígitos antes de buscar.')
            this.lookup = true
            try {
                const { data } = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${raw}`)
                this.lead.company = data.nome_fantasia || data.razao_social || this.lead.company
                this.lead.email = this.lead.email || data.email || ''
                if (!this.lead.phone && data.ddd_telefone_1) this.lead.phone = data.ddd_telefone_1.replace(/\D/g, '')
            } catch (e) {
                alert('CNPJ não encontrado. Preencha os dados manualmente.')
            } finally {
                this.lookup = false
            }
        },
        async addActivity() {
            this.busy = true
            try {
                await __api__.post('/api/crm/activities', { ...this.activity, due_at: this.activity.due_at || null, LeadId: this.lead.id })
                this.activity = emptyActivity()
                await this.load(this.lead.id)
            } catch (e) {
                alert(Crm.errorMessage(e, 'Não foi possível adicionar a atividade.'))
            } finally {
                this.busy = false
            }
        },
        async toggleDone(a) {
            await __api__.post(`/api/crm/activities/${a.id}/done`).catch((e) => alert(Crm.errorMessage(e)))
            await this.load(this.lead.id)
        },
    },
    async mounted() {
        __api__ = Crm.api()
        if (!__api__) return
        await Promise.all([
            __api__.get('/api/clients').then(({ data }) => (this.clients = data)).catch(() => {}),
            __api__.get('/api/sellers').then(({ data }) => (this.sellers = (data || []).filter((s) => s.active))).catch(() => {}),
            __api__.get('/api/crm/users').then(({ data }) => (this.users = data || [])).catch(() => {}),
        ])
        const params = Crm.params()
        if (params.id) {
            await this.load(params.id).catch((e) => alert(Crm.errorMessage(e, 'Lead não encontrado.')))
            if (!this.isNew) this.checkDuplicates().catch(() => {})
        }
    },
})
