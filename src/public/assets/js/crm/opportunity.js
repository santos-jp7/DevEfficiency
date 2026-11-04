let __api__ = null

const emptyActivity = () => ({ type: 'Ligação', subject: '', description: '', due_at: '', done: false })

new Vue({
    el: '#app',
    data: {
        Crm: window.Crm,
        isNew: true,
        busy: false,
        party: 'lead',
        o: {
            title: '',
            LeadId: null,
            ClientId: null,
            estimated_value: null,
            probability: Crm.STAGE_PROBABILITY.Novo,
            expected_close_date: '',
            kind: 'Serviço',
            SellerId: null,
            notes: '',
            stage: 'Novo',
            billing_mode: 'Direto',
            CommissionSupplierId: null,
            commission_percent: null,
            commission_value: null,
            commission_manual: false,
            OpportunityStageHistories: [],
            CrmActivities: [],
        },
        leads: [],
        clients: [],
        sellers: [],
        activity: emptyActivity(),
        lost: { reason: '', details: '' },
        lostModal: null,
    },
    computed: {
        converted() {
            return !!(this.o.ServiceOrderId || this.o.ProtocolId)
        },
        timeline() {
            const stages = (this.o.OpportunityStageHistories || []).map((h) => ({ key: 'h' + h.id, kind: 'stage', from: h.from_stage, to: h.to_stage, at: h.createdAt }))
            const acts = (this.o.CrmActivities || []).map((a) => ({ key: 'a' + a.id, kind: 'activity', a, at: a.done_at || a.due_at || a.createdAt }))
            // Pendentes primeiro (por vencimento), depois o histórico do mais recente para o mais antigo.
            const pending = acts.filter((i) => !i.a.done_at).sort((x, y) => new Date(x.a.due_at || x.a.createdAt) - new Date(y.a.due_at || y.a.createdAt))
            const past = [...stages, ...acts.filter((i) => i.a.done_at)].sort((x, y) => new Date(y.at) - new Date(x.at))
            return [...pending, ...past]
        },
    },
    methods: {
        payload() {
            const o = this.o
            return {
                title: o.title,
                LeadId: this.party === 'lead' ? o.LeadId || null : null,
                ClientId: this.party === 'client' ? o.ClientId || null : o.ClientId && o.LeadId ? o.ClientId : null,
                estimated_value: o.estimated_value === '' ? null : o.estimated_value,
                probability: o.probability,
                expected_close_date: o.expected_close_date || null,
                kind: o.kind,
                SellerId: o.SellerId || null,
                notes: o.notes || null,
                ...ProtocolCommission.payload(o),
            }
        },
        async load(id) {
            const { data } = await __api__.get('/api/crm/opportunities/' + id)
            data.expected_close_date = data.expected_close_date || ''
            this.o = data
            this.party = data.LeadId ? 'lead' : 'client'
            this.isNew = false
        },
        async save() {
            this.busy = true
            try {
                if (this.isNew) {
                    const { data } = await __api__.post('/api/crm/opportunities', this.payload())
                    location.href = './opportunity.html?id=' + data.id
                    return
                }
                await __api__.put('/api/crm/opportunities/' + this.o.id, this.payload())
                await this.load(this.o.id)
            } catch (e) {
                alert(Crm.errorMessage(e, 'Não foi possível salvar.'))
            } finally {
                this.busy = false
            }
        },
        async moveTo(stage) {
            if (stage === this.o.stage) return
            if (stage === 'Perdido') {
                this.lost = { reason: '', details: '' }
                return this.lostModal.show()
            }
            // Ganho abre a conversão: cliente (se for lead) + OS, protocolo avulso ou só ganhar.
            if (stage === 'Ganho') return this.$refs.win.open(this.o)
            await this.changeStage({ stage })
        },
        async changeStage(body) {
            this.busy = true
            try {
                await __api__.patch(`/api/crm/opportunities/${this.o.id}/stage`, body)
                await this.load(this.o.id)
            } catch (e) {
                alert(Crm.errorMessage(e, 'Não foi possível mudar a etapa.'))
            } finally {
                this.busy = false
            }
        },
        async onWon(result) {
            await this.load(this.o.id)
            if (result.BillingId && confirm('Oportunidade ganha e protocolo lançado. Abrir a cobrança gerada?'))
                location.href = '/billings/i.html?id=' + result.BillingId
        },
        async confirmLost() {
            this.lostModal.hide()
            await this.changeStage({ stage: 'Perdido', lost_reason: this.lost.reason, lost_details: this.lost.details })
        },
        async remove() {
            if (!confirm('Excluir esta oportunidade?')) return
            try {
                await __api__.delete('/api/crm/opportunities/' + this.o.id)
                location.href = './index.html'
            } catch (e) {
                alert(Crm.errorMessage(e, 'Não foi possível excluir.'))
            }
        },
        async addActivity() {
            this.busy = true
            try {
                await __api__.post('/api/crm/activities', {
                    ...this.activity,
                    due_at: this.activity.due_at || null,
                    OpportunityId: this.o.id,
                })
                this.activity = emptyActivity()
                await this.load(this.o.id)
            } catch (e) {
                alert(Crm.errorMessage(e, 'Não foi possível adicionar a atividade.'))
            } finally {
                this.busy = false
            }
        },
        async toggleDone(a) {
            await __api__.post(`/api/crm/activities/${a.id}/done`).catch((e) => alert(Crm.errorMessage(e)))
            await this.load(this.o.id)
        },
        async removeActivity(a) {
            if (!confirm('Excluir esta atividade?')) return
            await __api__.delete('/api/crm/activities/' + a.id).catch((e) => alert(Crm.errorMessage(e)))
            await this.load(this.o.id)
        },
    },
    async mounted() {
        __api__ = Crm.api()
        if (!__api__) return
        this.lostModal = new bootstrap.Modal(document.getElementById('lostModal'))

        const params = Crm.params()
        await Promise.all([
            __api__.get('/api/crm/leads?status=Ativo').then(({ data }) => (this.leads = data)).catch(() => {}),
            __api__.get('/api/clients').then(({ data }) => (this.clients = data)).catch(() => {}),
            __api__.get('/api/sellers').then(({ data }) => (this.sellers = (data || []).filter((s) => s.active))).catch(() => {}),
        ])

        if (params.id) {
            await this.load(params.id).catch((e) => alert(Crm.errorMessage(e, 'Oportunidade não encontrada.')))
            // Lead já convertido/descartado não vem na lista de ativos: garante que aparece no select.
            if (this.o.Lead && !this.leads.some((l) => l.id === this.o.Lead.id)) this.leads.push(this.o.Lead)
        } else {
            if (params.LeadId) {
                this.party = 'lead'
                this.o.LeadId = Number(params.LeadId)
                const lead = this.leads.find((l) => l.id === this.o.LeadId)
                if (lead && lead.SellerId) this.o.SellerId = lead.SellerId
            }
            if (params.ClientId) {
                this.party = 'client'
                this.o.ClientId = Number(params.ClientId)
            }
        }
    },
})
