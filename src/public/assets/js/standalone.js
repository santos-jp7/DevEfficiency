// Lançamento avulso: protocolo direto para um cliente (sem OS/assinatura) que já vai para cobrança.
// Compartilhado entre a aba Protocolos e a página inicial. Uso: <button onclick="StandaloneLaunch.open()">.
;(function () {
    const MODAL_ID = 'standaloneModal'
    let vm = null

    const emptyForm = () => ({
        ClientId: null,
        SellerId: null,
        notes: '',
        discount_value: null,
        // Cobrança: direta ao cliente ou comissão de terceiro (fornecedor cobra o cliente).
        billing_mode: 'Direto',
        CommissionSupplierId: null,
        commission_percent: null,
        commission_value: null,
        commission_manual: false,
        payment_terms: '',
        installments_manual: false,
        _installments: [],
        registers: [window.StandaloneItems.emptyRegister()],
        products: [],
    })

    const TEMPLATE = `
    <div class="modal fade" id="${MODAL_ID}" tabindex="-1">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <div class="modal-content">
                <div class="modal-header">
                    <h6 class="modal-title">Lançamento avulso</h6>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <p class="small text-muted mb-3">
                        Gera um protocolo para o cliente, lança os registros e produtos e já libera para pagamento,
                        entrando na cobrança pendente do cliente pelas regras de sempre.
                    </p>

                    <div class="row">
                        <div class="mb-3 col-md-5">
                            <label class="form-label">Cliente</label>
                            <select class="form-select" v-model="form.ClientId">
                                <option :value="null" disabled>Selecione…</option>
                                <option v-for="c in clients" :value="c.id">{{ c.name }}{{ c.is_partner ? ' (parceiro)' : '' }}</option>
                            </select>
                        </div>
                        <div class="mb-3 col-md-3">
                            <label class="form-label">Vendedor</label>
                            <select class="form-select" v-model="form.SellerId">
                                <option :value="null">Sem vendedor</option>
                                <option v-for="s in sellers" :value="s.id">{{ s.name }} ({{ s.commission_percent }}%)</option>
                            </select>
                        </div>
                        <div class="mb-3 col-md-4">
                            <label class="form-label">Observações</label>
                            <input type="text" class="form-control" v-model="form.notes">
                        </div>
                    </div>

                    <standalone-items :form="form" :products="products" :hourly-rate="hourlyRate" :partner-percent="partnerPercent"></standalone-items>

                    <div class="row mt-3">
                        <div class="col-md-4">
                            <label class="form-label">Desconto (R$)</label>
                            <input type="number" step="0.01" min="0" class="form-control" v-model.number="form.discount_value" placeholder="0,00">
                        </div>
                        <div class="col-md-8 text-end">
                            <div class="text-muted small">Subtotal {{ brl(subtotal) }} · Desconto -{{ brl(discount) }}</div>
                            <div class="fs-5 fw-bold">Total {{ brl(Math.max(subtotal - discount, 0)) }}</div>
                        </div>
                    </div>

                    <div class="mt-3">
                        <protocol-commission :protocol="form" :net="Math.max(subtotal - discount, 0)"></protocol-commission>
                        <payment-terms :protocol="form" :total="toBill"></payment-terms>
                    </div>

                    <div v-if="error" class="alert alert-danger py-2 mt-3 mb-0">{{ error }}</div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="button" class="btn btn-dark" :disabled="saving" @click="submit">
                        <i class="fa-solid fa-paper-plane"></i> {{ saving ? 'Lançando…' : 'Lançar e gerar cobrança' }}
                    </button>
                </div>
            </div>
        </div>
    </div>`

    function api() {
        const token = localStorage.getItem('token')
        const type = localStorage.getItem('type')
        return axios.create({ headers: { Authorization: [type, token].join(' ') } })
    }

    function build() {
        const root = document.createElement('div')
        document.body.appendChild(root)

        vm = new Vue({
            el: root,
            template: `<div>${TEMPLATE}</div>`,
            data: { form: emptyForm(), clients: [], products: [], sellers: [], hourlyRate: 120, saving: false, error: '', loaded: false },
            computed: {
                client() {
                    return this.clients.find((c) => c.id === this.form.ClientId) || null
                },
                partnerPercent() {
                    return this.client && this.client.is_partner ? Number(this.client.partner_discount_percent) || 0 : 0
                },
                subtotal() {
                    return window.StandaloneItems.subtotal(this.form, this.hourlyRate, this.partnerPercent)
                },
                discount() {
                    return Number(this.form.discount_value) || 0
                },
                // Valor a cobrar: o total ao cliente (direta) ou a comissão (comissão de terceiro).
                toBill() {
                    const net = Math.max(this.subtotal - this.discount, 0)
                    return window.ProtocolCommission.isCommission(this.form) ? window.ProtocolCommission.expected(this.form, net) : net
                },
            },
            methods: {
                brl: (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0),
                async load() {
                    if (this.loaded) return
                    const http = api()
                    const [clients, products, sellers, rate] = await Promise.all([
                        http.get('/api/clients'),
                        http.get('/api/products'),
                        http.get('/api/sellers').catch(() => ({ data: [] })),
                        http.get('/api/config/hourly_rate').catch(() => ({ data: null })),
                    ])
                    this.clients = clients.data
                    this.products = products.data
                    this.sellers = sellers.data.filter((s) => s.active)
                    if (Number(rate.data && rate.data.value) > 0) this.hourlyRate = Number(rate.data.value)
                    this.loaded = true
                },
                async submit() {
                    this.error = ''

                    if (!this.form.ClientId) return (this.error = 'Selecione o cliente.')

                    const { registers, products, error } = window.StandaloneItems.payload(this.form)
                    if (error) return (this.error = error)

                    if (!registers.length && !products.length) return (this.error = 'Lance ao menos um registro ou produto.')

                    const commission = this.form.billing_mode === 'Comissão'
                    if (commission && !this.form.CommissionSupplierId) return (this.error = 'Selecione o fornecedor que paga a comissão.')

                    this.saving = true
                    try {
                        const { data } = await api().post('/api/protocols/standalone', {
                            ClientId: this.form.ClientId,
                            SellerId: this.form.SellerId || null,
                            notes: this.form.notes || null,
                            discount_value: this.form.discount_value || 0,
                            registers,
                            products,
                            ...window.ProtocolCommission.payload(this.form),
                            ...window.PaymentTerms.payload(this.form),
                        })

                        bootstrap.Modal.getInstance(document.getElementById(MODAL_ID)).hide()
                        this.form = emptyForm()

                        const goBilling = confirm(
                            commission
                                ? `Protocolo #${data.id} lançado. A comissão entrou na cobrança do fornecedor.\n\nAbrir a cobrança do fornecedor agora?`
                                : `Protocolo #${data.id} lançado e liberado para pagamento.\n\nAbrir a cobrança do cliente agora?`,
                        )
                        if (goBilling && data.BillingId) location.href = `/billings/i.html?id=${data.BillingId}`
                        else location.reload()
                    } catch (e) {
                        this.error = (e.response && e.response.data && e.response.data.message) || 'Não foi possível lançar. Tente novamente.'
                    } finally {
                        this.saving = false
                    }
                },
            },
        })
    }

    window.StandaloneLaunch = {
        async open() {
            if (!vm) build()
            vm.error = ''
            try {
                await vm.load()
            } catch (e) {
                return alert('Não foi possível carregar clientes/produtos.')
            }
            bootstrap.Modal.getOrCreateInstance(document.getElementById(MODAL_ID)).show()
        },
    }
})()
