// Modal "Ganhar oportunidade": cria o cliente (se for lead) e gera OS, protocolo avulso ou nada.
// Requer common.js, pricing.js, protocolCommission.js e standaloneItems.js.
// Uso: <crm-win-modal ref="win" @done="onWon" @cancel="onCancel"></crm-win-modal> e this.$refs.win.open(oportunidade)
;(function () {
    const emptyForm = (o) => ({
        mode: 'protocol',
        subject: o?.title || '',
        gravidade: '',
        prazo: '',
        ProjectId: null,
        registers: [],
        products: [window.StandaloneItems.emptyProduct()],
        discount_value: null,
        notes: '',
        // Cobrança: começa com a da oportunidade.
        billing_mode: o?.billing_mode || 'Direto',
        CommissionSupplierId: o?.CommissionSupplierId ?? null,
        commission_percent: o?.commission_percent ?? null,
        commission_value: o?.commission_value ?? null,
        commission_manual: !!o?.commission_manual,
        payment_terms: '',
        installments_manual: false,
        _installments: [],
        Receipts: [],
    })

    let catalog = null // { products, projects, hourlyRate } carregado uma vez

    Vue.component('crm-win-modal', {
        data: () => ({ o: null, form: emptyForm(null), products: [], projects: [], hourlyRate: 120, saving: false, error: '', modal: null, done: false, clientMatches: [] }),
        computed: {
            client() {
                return this.o?.Client || null
            },
            partnerPercent() {
                return this.client && this.client.is_partner ? Number(this.client.partner_discount_percent) || 0 : 0
            },
            subtotal() {
                return window.StandaloneItems.subtotal(this.form, this.hourlyRate, this.partnerPercent)
            },
            net() {
                return Math.max(this.subtotal - (Number(this.form.discount_value) || 0), 0)
            },
            clientProjects() {
                const id = this.o?.ClientId
                return id ? this.projects.filter((p) => p.ClientId === id) : []
            },
            toBill() {
                return window.ProtocolCommission.isCommission(this.form) ? window.ProtocolCommission.expected(this.form, this.net) : this.net
            },
            leadLabel() {
                const l = this.o?.Lead
                return l ? l.company || l.name : ''
            },
        },
        methods: {
            brl: (v) => window.Crm.brlFull(v),
            async loadCatalog(api) {
                if (!catalog) {
                    catalog = Promise.all([
                        api.get('/api/products').then((r) => r.data).catch(() => []),
                        api.get('/api/projects').then((r) => r.data).catch(() => []),
                        api.get('/api/config/hourly_rate').then((r) => Number(r.data && r.data.value) || 120).catch(() => 120),
                    ])
                }
                const [products, projects, hourlyRate] = await catalog
                this.products = products
                this.projects = projects
                this.hourlyRate = hourlyRate
            },
            async open(opportunity) {
                this.o = opportunity
                this.form = emptyForm(opportunity)
                this.error = ''
                this.done = false
                this.saving = false
                const api = window.Crm.api()
                if (!api) return
                await this.loadCatalog(api)
                // Lead ainda sem cliente: clientes já cadastrados que parecem ser o mesmo (CNPJ/CPF ou e-mail).
                this.clientMatches = []
                if (!opportunity.ClientId && opportunity.LeadId && !opportunity.SourceServiceOrderId) {
                    const { data } = await api.get(`/api/crm/leads/${opportunity.LeadId}/matches`).catch(() => ({ data: { clients: [] } }))
                    this.clientMatches = data.clients || []
                    const byDoc = this.clientMatches.find((c) => c.reason === 'documento')
                    this.$set(this.form, 'client_choice', byDoc ? byDoc.id : 'new')
                }
                this.modal = this.modal || new bootstrap.Modal(this.$refs.modal, { backdrop: 'static' })
                this.modal.show()
            },
            cancel() {
                this.modal && this.modal.hide()
                this.$emit('cancel', this.o)
            },
            async submit() {
                this.error = ''
                const f = this.form
                const body = { mode: f.mode, ...window.ProtocolCommission.payload(f) }
                if (!this.o.ClientId && f.client_choice !== undefined) body.client_choice = f.client_choice

                if (f.mode === 'os') {
                    if (!f.subject.trim()) return (this.error = 'Informe o assunto da OS.')
                    Object.assign(body, { subject: f.subject, gravidade: f.gravidade || null, prazo: f.prazo || null, ProjectId: f.ProjectId || null })
                } else if (f.mode === 'protocol') {
                    const { registers, products, error } = window.StandaloneItems.payload(f)
                    if (error) return (this.error = error)
                    if (!registers.length && !products.length) return (this.error = 'Lance ao menos um registro ou produto.')
                    Object.assign(body, { registers, products, discount_value: f.discount_value || 0, notes: f.notes || undefined, ...window.PaymentTerms.payload(f) })
                }
                if (f.mode !== 'none' && f.billing_mode === 'Comissão' && !f.CommissionSupplierId)
                    return (this.error = 'Selecione o fornecedor que paga a comissão.')

                this.saving = true
                try {
                    const { data } = await window.Crm.api().post(`/api/crm/opportunities/${this.o.id}/win`, body)
                    this.done = true
                    this.modal.hide()
                    this.$emit('done', data)
                } catch (e) {
                    this.error = window.Crm.errorMessage(e, 'Não foi possível ganhar a oportunidade.')
                } finally {
                    this.saving = false
                }
            },
        },
        template: `
        <div class="modal fade" tabindex="-1" ref="modal">
            <div class="modal-dialog modal-xl modal-dialog-scrollable">
                <div class="modal-content" v-if="o">
                    <div class="modal-header">
                        <h6 class="modal-title">Ganhar: {{ o.title }}</h6>
                        <button type="button" class="btn-close" @click="cancel"></button>
                    </div>
                    <div class="modal-body">
                        <div v-if="!o.ClientId && clientMatches.length" class="alert alert-warning py-2 small">
                            <div class="mb-1"><i class="fa-solid fa-clone"></i> Já existe cliente parecido com o lead <strong>{{ leadLabel }}</strong>:</div>
                            <div class="form-check" v-for="c in clientMatches" :key="c.id">
                                <input class="form-check-input" type="radio" :id="'cm' + c.id" :value="c.id" v-model="form.client_choice">
                                <label class="form-check-label" :for="'cm' + c.id">Usar o cliente <strong>{{ c.name }}</strong> (mesmo {{ c.reason }})</label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="radio" id="cmnew" value="new" v-model="form.client_choice">
                                <label class="form-check-label" for="cmnew">Criar um cliente novo</label>
                            </div>
                        </div>
                        <div v-else-if="!o.ClientId" class="alert alert-info py-2 small">
                            <i class="fa-solid fa-user-plus"></i> O lead <strong>{{ leadLabel }}</strong> vai virar cliente (com contato), e o lead fica como Convertido.
                        </div>
                        <div v-else class="small text-muted mb-2">Cliente: <strong>{{ o.Client && o.Client.name }}</strong></div>

                        <div class="btn-group btn-group-sm mb-3 flex-wrap">
                            <button type="button" class="btn" :class="form.mode === 'protocol' ? 'btn-dark' : 'btn-outline-dark'" @click="form.mode = 'protocol'">
                                <i class="fa-solid fa-file-invoice-dollar"></i> Lançar protocolo avulso
                            </button>
                            <button type="button" class="btn" :class="form.mode === 'os' ? 'btn-dark' : 'btn-outline-dark'" @click="form.mode = 'os'">
                                <i class="fa-solid fa-screwdriver-wrench"></i> Gerar OS
                            </button>
                            <button type="button" class="btn" :class="form.mode === 'none' ? 'btn-dark' : 'btn-outline-dark'" @click="form.mode = 'none'">
                                Só marcar como ganha
                            </button>
                        </div>

                        <div v-if="form.mode === 'os'">
                            <p class="small text-muted">Abre a OS (com protocolo, vendedor e cobrança da oportunidade) para orçar e executar.</p>
                            <div class="row g-2">
                                <div class="col-md-6">
                                    <label class="form-label small mb-0">Assunto</label>
                                    <input type="text" class="form-control form-control-sm" v-model="form.subject" maxlength="128">
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label small mb-0">Gravidade</label>
                                    <select class="form-select form-select-sm" v-model="form.gravidade">
                                        <option value="">—</option>
                                        <option>Crítico</option><option>Alto</option><option>Médio</option><option>Baixo</option>
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label small mb-0">Prazo</label>
                                    <input type="date" class="form-control form-control-sm" v-model="form.prazo">
                                </div>
                                <div class="col-md-2" v-if="clientProjects.length">
                                    <label class="form-label small mb-0">Projeto</label>
                                    <select class="form-select form-select-sm" v-model="form.ProjectId">
                                        <option :value="null">Sem projeto</option>
                                        <option v-for="p in clientProjects" :value="p.id">{{ p.name }}</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div v-if="form.mode === 'protocol'">
                            <p class="small text-muted">Lança os itens e já libera para pagamento: a cobrança sai para o cliente (direta) ou para o fornecedor (comissão).</p>
                            <standalone-items :form="form" :products="products" :hourly-rate="hourlyRate" :partner-percent="partnerPercent"></standalone-items>
                            <div class="row mt-3">
                                <div class="col-md-3">
                                    <label class="form-label small mb-0">Desconto (R$)</label>
                                    <input type="number" step="0.01" min="0" class="form-control form-control-sm" v-model.number="form.discount_value" placeholder="0,00">
                                </div>
                                <div class="col-md-5">
                                    <label class="form-label small mb-0">Observações</label>
                                    <input type="text" class="form-control form-control-sm" v-model="form.notes" :placeholder="'Oportunidade #' + o.id">
                                </div>
                                <div class="col-md-4 text-end">
                                    <div class="small text-muted">Subtotal {{ brl(subtotal) }}</div>
                                    <div class="fw-bold">Total {{ brl(net) }}</div>
                                    <div class="small text-muted" v-if="o.estimated_value != null">Estimado na oportunidade: {{ brl(o.estimated_value) }}</div>
                                </div>
                            </div>
                        </div>

                        <div class="mt-3" v-if="form.mode !== 'none'">
                            <protocol-commission :protocol="form" :net="form.mode === 'protocol' ? net : Number(o.estimated_value) || 0" :show-received="false"></protocol-commission>
                            <payment-terms v-if="form.mode === 'protocol'" :protocol="form" :total="toBill"></payment-terms>
                        </div>

                        <div v-if="error" class="alert alert-danger py-2 mt-3 mb-0">{{ error }}</div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" @click="cancel">Cancelar</button>
                        <button type="button" class="btn btn-success" :disabled="saving" @click="submit">
                            <i class="fa-solid fa-trophy"></i> {{ saving ? 'Gerando…' : 'Ganhar' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>`,
    })
})()
