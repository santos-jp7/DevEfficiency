// Bloco "Cobrança" do protocolo (OS, assinatura, avulso e tela do protocolo).
// Direta: eu cobro o cliente. Comissão de terceiro: o fornecedor (Microsoft, Bitdefender...) cobra o cliente pelo
// valor cheio e o sistema gera a cobrança da comissão contra o fornecedor.
// Uso: <protocol-commission :protocol="protocol" :net="totalLiquido"></protocol-commission>
//      e no PUT/POST: { ...ProtocolCommission.payload(protocol) }
;(function () {
    const round2 = (v) => Math.round((Number(v) || 0) * 100 + Number.EPSILON) / 100
    const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

    let suppliersCache = null
    function loadSuppliers() {
        if (suppliersCache) return suppliersCache
        const token = localStorage.getItem('token')
        const type = localStorage.getItem('type')
        suppliersCache = axios
            .get('/api/suppliers', { headers: { Authorization: [type, token].join(' ') } })
            .then((res) => res.data || [])
            .catch(() => {
                suppliersCache = null
                return []
            })
        return suppliersCache
    }

    window.ProtocolCommission = {
        isCommission: (protocol) => protocol?.billing_mode === 'Comissão',
        // Campos enviados à API. Valor só vai quando informado na mão; vazio = sugerido pela %.
        payload(protocol) {
            const commission = protocol?.billing_mode === 'Comissão'
            return {
                billing_mode: commission ? 'Comissão' : 'Direto',
                CommissionSupplierId: commission ? protocol.CommissionSupplierId || null : protocol?.CommissionSupplierId || null,
                commission_percent: protocol?.commission_percent ?? '',
                commission_value: commission && protocol.commission_manual ? protocol.commission_value ?? '' : '',
            }
        },
        expected(protocol, net) {
            if (protocol?.commission_manual) return round2(protocol.commission_value)
            return round2(((Number(net) || 0) * (Number(protocol?.commission_percent) || 0)) / 100)
        },
    }

    Vue.component('protocol-commission', {
        props: {
            protocol: { type: Object, required: true },
            net: { type: Number, default: 0 },
            // Depois de liberado a cobrança já foi gerada: só dá para mudar com o protocolo "Em aberto".
            locked: { type: Boolean, default: false },
        },
        data: () => ({ suppliers: [] }),
        mounted() {
            loadSuppliers().then((list) => (this.suppliers = list))
        },
        computed: {
            commission() {
                return this.protocol.billing_mode === 'Comissão'
            },
            suggested() {
                return round2(((Number(this.net) || 0) * (Number(this.protocol.commission_percent) || 0)) / 100)
            },
            expected() {
                return window.ProtocolCommission.expected(this.protocol, this.net)
            },
            received() {
                return round2((this.protocol.Receipts || []).reduce((s, r) => s + (Number(r.value) || 0), 0))
            },
        },
        methods: {
            brl,
            setMode(mode) {
                this.$set(this.protocol, 'billing_mode', mode)
            },
            pickSupplier(id) {
                this.$set(this.protocol, 'CommissionSupplierId', id || null)
                const supplier = this.suppliers.find((s) => s.id === id)
                if (supplier && supplier.default_commission_percent != null && (this.protocol.commission_percent == null || this.protocol.commission_percent === ''))
                    this.$set(this.protocol, 'commission_percent', Number(supplier.default_commission_percent))
            },
            setManualValue(value) {
                this.$set(this.protocol, 'commission_value', value === '' ? null : Number(value))
                this.$set(this.protocol, 'commission_manual', value !== '')
            },
            useSuggested() {
                this.$set(this.protocol, 'commission_manual', false)
                this.$set(this.protocol, 'commission_value', this.suggested)
            },
        },
        template: `
        <div class="border rounded p-2 mb-3">
            <div class="d-flex flex-wrap align-items-center gap-3 mb-2">
                <strong class="me-2">Cobrança</strong>
                <div class="btn-group btn-group-sm" role="group">
                    <button type="button" class="btn" :class="!commission ? 'btn-dark' : 'btn-outline-dark'" :disabled="locked" @click="setMode('Direto')">Direta ao cliente</button>
                    <button type="button" class="btn" :class="commission ? 'btn-dark' : 'btn-outline-dark'" :disabled="locked" @click="setMode('Comissão')">Comissão de terceiro</button>
                </div>
                <small class="text-muted" v-if="locked">Altere com o protocolo "Em aberto".</small>
            </div>

            <div v-if="commission">
                <p class="small text-muted mb-2">
                    O fornecedor cobra o cliente pelo valor cheio; ao liberar, a cobrança gerada é a da comissão, contra o fornecedor.
                </p>
                <div class="row g-2">
                    <div class="col-md-5">
                        <label class="form-label small mb-0">Fornecedor (quem paga a comissão)</label>
                        <select class="form-select form-select-sm" :value="protocol.CommissionSupplierId" :disabled="locked" @change="pickSupplier(Number($event.target.value) || null)">
                            <option :value="null">Selecione…</option>
                            <option v-for="s in suppliers" :value="s.id">{{ s.name }}{{ s.default_commission_percent != null ? ' (' + s.default_commission_percent + '%)' : '' }}</option>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label small mb-0">% comissão</label>
                        <input type="number" step="0.01" min="0" max="100" class="form-control form-control-sm" :disabled="locked"
                            :value="protocol.commission_percent" @input="$set(protocol, 'commission_percent', $event.target.value === '' ? null : Number($event.target.value))">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small mb-0">Valor da comissão (R$)</label>
                        <input type="number" step="0.01" min="0" class="form-control form-control-sm" :disabled="locked"
                            :value="protocol.commission_manual ? protocol.commission_value : suggested" @input="setManualValue($event.target.value)">
                        <div class="form-text" v-if="protocol.commission_manual">
                            Informado na mão.
                            <a href="#" v-if="!locked" @click.prevent="useSuggested">Usar % ({{ brl(suggested) }})</a>
                        </div>
                        <div class="form-text" v-else>Sugerido pela %.</div>
                    </div>
                </div>
                <ul class="small mt-2 mb-0">
                    <li>Valor ao cliente (pago ao fornecedor): <strong>{{ brl(net) }}</strong></li>
                    <li>Comissão a receber: <strong>{{ brl(expected) }}</strong></li>
                    <li>Recebido: {{ brl(received) }} &middot; Pendente: <strong>{{ brl(Math.max(expected - received, 0)) }}</strong></li>
                </ul>
            </div>
        </div>`,
    })
})()
