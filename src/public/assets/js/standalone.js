// Lançamento avulso: protocolo direto para um cliente (sem OS/assinatura) que já vai para cobrança.
// Compartilhado entre a aba Protocolos e a página inicial. Uso: <button onclick="StandaloneLaunch.open()">.
;(function () {
    const MODAL_ID = 'standaloneModal'
    let vm = null

    const emptyRegister = () => ({
        type: 'Serviço',
        description: '',
        estimated_hours: null,
        hourly_rate: null,
        value: null,
        manual_override: false,
    })
    const emptyProduct = () => ({ ProductId: null, value: null })
    const emptyForm = () => ({
        ClientId: null,
        SellerId: null,
        notes: '',
        discount_value: null,
        registers: [emptyRegister()],
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

                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="mb-2">Registros</h6>
                        <button type="button" class="btn btn-sm btn-outline-dark" @click="form.registers.push(newRegister())"><i class="fa-solid fa-plus"></i> Registro</button>
                    </div>
                    <div v-for="(r, i) in form.registers" :key="'r' + i" class="row g-2 align-items-end border rounded p-2 mb-2">
                        <div class="col-md-2">
                            <label class="form-label small mb-0">Tipo</label>
                            <select class="form-select form-select-sm" v-model="r.type">
                                <option>Serviço</option>
                                <option>Despesa</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small mb-0">Descrição</label>
                            <input type="text" class="form-control form-control-sm" v-model="r.description">
                        </div>
                        <template v-if="r.type === 'Serviço' && !r.manual_override">
                            <div class="col-md-2">
                                <label class="form-label small mb-0">Horas</label>
                                <input type="number" step="0.25" min="0" class="form-control form-control-sm" v-model.number="r.estimated_hours">
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small mb-0">Valor/hora</label>
                                <input type="number" step="0.01" min="0" class="form-control form-control-sm" v-model.number="r.hourly_rate" :placeholder="String(hourlyRate)">
                            </div>
                        </template>
                        <div class="col-md-4" v-else>
                            <label class="form-label small mb-0">Valor (R$)</label>
                            <input type="number" step="0.01" min="0" class="form-control form-control-sm" v-model.number="r.value">
                        </div>
                        <div class="col text-end">
                            <div class="small fw-bold">{{ brl(registerNet(r)) }}</div>
                            <button type="button" class="btn btn-sm btn-link text-danger p-0" @click="form.registers.splice(i, 1)"><i class="fa-solid fa-trash"></i></button>
                        </div>
                        <div class="col-12" v-if="r.type === 'Serviço'">
                            <div class="form-check form-check-inline small">
                                <input class="form-check-input" type="checkbox" :id="'mo' + i" v-model="r.manual_override" @change="toggleManual(r)">
                                <label class="form-check-label" :for="'mo' + i">Informar valor final manualmente (em vez de horas × valor/hora)</label>
                            </div>
                            <span v-if="partnerPercent > 0 && !r.manual_override && Number(r.estimated_hours) > 0" class="small text-success">
                                Desconto parceiro {{ partnerPercent }}% aplicado
                            </span>
                        </div>
                    </div>

                    <div class="d-flex justify-content-between align-items-center mt-3">
                        <h6 class="mb-2">Produtos (cobrança única)</h6>
                        <button type="button" class="btn btn-sm btn-outline-dark" @click="form.products.push(newProduct())"><i class="fa-solid fa-plus"></i> Produto</button>
                    </div>
                    <div v-for="(p, i) in form.products" :key="'p' + i" class="row g-2 align-items-end border rounded p-2 mb-2">
                        <div class="col-md-6">
                            <label class="form-label small mb-0">Produto</label>
                            <select class="form-select form-select-sm" v-model="p.ProductId" @change="fillProduct(p)">
                                <option :value="null" disabled>Selecione…</option>
                                <option v-for="pr in products" :value="pr.id">{{ pr.description }}</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small mb-0">Valor (R$)</label>
                            <input type="number" step="0.01" min="0" class="form-control form-control-sm" v-model.number="p.value">
                        </div>
                        <div class="col text-end">
                            <button type="button" class="btn btn-sm btn-link text-danger p-0" @click="form.products.splice(i, 1)"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>

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
                    return (
                        this.form.registers.reduce((s, r) => s + this.registerNet(r), 0) +
                        this.form.products.reduce((s, p) => s + (Number(p.value) || 0), 0)
                    )
                },
                discount() {
                    return Number(this.form.discount_value) || 0
                },
            },
            methods: {
                brl: (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0),
                newRegister: emptyRegister,
                newProduct: emptyProduct,
                // Mesma conta do servidor (o servidor sempre recalcula ao gravar).
                registerNet(r) {
                    if (r.type === 'Serviço' && !r.manual_override) {
                        if (!(Number(r.estimated_hours) > 0)) return 0
                        return window.Pricing.calc(r.estimated_hours, r.hourly_rate || this.hourlyRate, this.partnerPercent).net
                    }
                    return Number(r.value) || 0
                },
                toggleManual(r) {
                    if (r.manual_override) r.value = this.registerNet({ ...r, manual_override: false }) || null
                },
                fillProduct(p) {
                    const product = this.products.find((x) => x.id === p.ProductId)
                    if (product && !p.value) p.value = Number(product.value) || null
                },
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

                    const registers = this.form.registers
                        .filter((r) => r.description || r.estimated_hours || r.value)
                        .map((r) => ({
                            type: r.type,
                            description: r.description,
                            ...(r.type === 'Serviço' && !r.manual_override
                                ? { estimated_hours: r.estimated_hours, hourly_rate: r.hourly_rate || undefined }
                                : { value: r.value, manual_override: r.type === 'Serviço' }),
                        }))

                    if (registers.some((r) => !r.description)) return (this.error = 'Todo registro precisa de descrição.')

                    const products = this.form.products.filter((p) => p.ProductId).map((p) => ({ ProductId: p.ProductId, value: p.value || 0 }))

                    if (!registers.length && !products.length) return (this.error = 'Lance ao menos um registro ou produto.')

                    this.saving = true
                    try {
                        const { data } = await api().post('/api/protocols/standalone', {
                            ClientId: this.form.ClientId,
                            SellerId: this.form.SellerId || null,
                            notes: this.form.notes || null,
                            discount_value: this.form.discount_value || 0,
                            registers,
                            products,
                        })

                        bootstrap.Modal.getInstance(document.getElementById(MODAL_ID)).hide()
                        this.form = emptyForm()

                        const goBilling = confirm(`Protocolo #${data.id} lançado e liberado para pagamento.\n\nAbrir a cobrança do cliente agora?`)
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
