// Condição de pagamento do protocolo: cobrança única (padrão), condição em dias após a liberação (ex.: 15/30/60)
// ou vencimentos informados à mão. Cada parcela vira uma cobrança com o seu vencimento ao liberar.
// Uso: <payment-terms :protocol="protocol" :total="valorACobrar" :locked="..."></payment-terms>
//      e no PUT/POST: { ...PaymentTerms.payload(protocol) }
;(function () {
    const PRESETS = ['15/30/60', '30/60/90', '30', '28/56', '30/60']
    const round2 = (v) => Math.round((Number(v) || 0) * 100 + Number.EPSILON) / 100
    const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
    const br = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

    function parse(terms) {
        const days = String(terms || '')
            .split(/[\/,;\s]+/)
            .filter(Boolean)
            .map(Number)
        if (!days.length) return null
        if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 720)) return 'invalid'
        for (let i = 1; i < days.length; i++) if (days[i] <= days[i - 1]) return 'invalid'
        return days
    }

    function plan(days, total) {
        const each = Math.floor((round2(total) / days.length) * 100) / 100
        return days.map((d, i) => ({
            due_date: moment().add(d, 'days').format('YYYY-MM-DD'),
            value: i === days.length - 1 ? round2(total - each * (days.length - 1)) : each,
        }))
    }

    // Parcelas que o formulário pode editar: pendentes e sem nada pago.
    const editable = (p) => (p.ProtocolInstallments || []).filter((i) => i.status === 'pendente' && !(Number(i.paid_value) > 0))

    window.PaymentTerms = {
        parse,
        plan,
        payload(p) {
            const manual = !!p?.installments_manual
            const rows = manual ? (p._installments || editable(p)).map((r) => ({ due_date: r.due_date, value: round2(r.value) })) : null
            return { payment_terms: p?.payment_terms || '', installments: rows }
        },
    }

    Vue.component('payment-terms', {
        props: {
            protocol: { type: Object, required: true },
            total: { type: Number, default: 0 },
            locked: { type: Boolean, default: false },
        },
        data: () => ({ suppliers: [], custom: false }),
        mounted() {
            if (!this.protocol._installments) this.$set(this.protocol, '_installments', editable(this.protocol).map((i) => ({ due_date: i.due_date, value: Number(i.value) })))
            this.custom = !!this.protocol.payment_terms && !PRESETS.includes(this.protocol.payment_terms)
            if (window.ProtocolCommission && window.ProtocolCommission.loadSuppliers)
                window.ProtocolCommission.loadSuppliers().then((list) => (this.suppliers = list))
        },
        computed: {
            presets: () => PRESETS,
            days() {
                return parse(this.protocol.payment_terms)
            },
            preview() {
                return Array.isArray(this.days) && this.total > 0 ? plan(this.days, this.total) : []
            },
            supplierDefault() {
                if (this.protocol.billing_mode !== 'Comissão' || !this.protocol.CommissionSupplierId) return ''
                const s = this.suppliers.find((x) => x.id === this.protocol.CommissionSupplierId)
                return (s && s.default_payment_terms) || ''
            },
            paid() {
                return (this.protocol.ProtocolInstallments || []).filter((i) => i.status !== 'pendente' || Number(i.paid_value) > 0)
            },
            rows() {
                return this.protocol._installments || []
            },
            rowsTotal() {
                return round2(this.rows.reduce((s, r) => s + (Number(r.value) || 0), 0))
            },
        },
        methods: {
            brl,
            br,
            pick(value) {
                if (value === '__custom') {
                    this.custom = true
                    return
                }
                this.custom = false
                this.$set(this.protocol, 'payment_terms', value)
            },
            setManual(on) {
                this.$set(this.protocol, 'installments_manual', on)
                if (on && !this.rows.length) this.fillFromTerms()
            },
            fillFromTerms() {
                const days = Array.isArray(this.days) ? this.days : Array.isArray(parse(this.supplierDefault)) ? parse(this.supplierDefault) : [30]
                this.$set(this.protocol, '_installments', plan(days, this.total))
            },
            addRow() {
                const last = this.rows[this.rows.length - 1]
                const date = last ? moment(last.due_date).add(30, 'days') : moment().add(30, 'days')
                this.rows.push({ due_date: date.format('YYYY-MM-DD'), value: round2(Math.max(this.total - this.rowsTotal, 0)) })
            },
        },
        template: `
        <div class="border rounded p-2 mb-3">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <strong class="me-2">Condição de pagamento</strong>
                <select class="form-select form-select-sm" style="max-width: 220px" :disabled="locked || protocol.installments_manual"
                    :value="custom ? '__custom' : (protocol.payment_terms || '')" @change="pick($event.target.value)">
                    <option value="">{{ supplierDefault ? 'Padrão do fornecedor (' + supplierDefault + ')' : 'Cobrança única (padrão)' }}</option>
                    <option v-for="p in presets" :value="p">{{ p }} dias</option>
                    <option value="__custom">Outra…</option>
                </select>
                <input v-if="custom && !protocol.installments_manual" type="text" class="form-control form-control-sm" style="max-width: 160px" placeholder="ex.: 10/40/70"
                    :disabled="locked" :value="protocol.payment_terms" @input="$set(protocol, 'payment_terms', $event.target.value)">
                <div class="form-check ms-2">
                    <input class="form-check-input" type="checkbox" :id="'manual' + _uid" :disabled="locked" :checked="protocol.installments_manual" @change="setManual($event.target.checked)">
                    <label class="form-check-label small" :for="'manual' + _uid">Informar vencimentos manualmente</label>
                </div>
                <small class="text-muted" v-if="locked">Altere com o protocolo "Em aberto".</small>
            </div>

            <div v-if="days === 'invalid' && !protocol.installments_manual" class="text-danger small">Use os dias separados por barra, crescentes (ex.: 15/30/60).</div>

            <div v-if="paid.length" class="small text-muted mb-1">
                Já pagas/encerradas:
                <span v-for="i in paid" :key="i.id" class="me-2">#{{ i.number }} {{ br(i.due_date) }} {{ brl(i.paid_value || i.value) }} ({{ i.status }})</span>
            </div>

            <table v-if="protocol.installments_manual" class="table table-sm mb-1">
                <thead><tr><th>#</th><th>Vencimento</th><th>Valor</th><th></th></tr></thead>
                <tbody>
                    <tr v-for="(r, i) in rows" :key="i">
                        <td class="small">{{ i + 1 }}</td>
                        <td><input type="date" class="form-control form-control-sm" v-model="r.due_date" :disabled="locked"></td>
                        <td><input type="number" step="0.01" min="0" class="form-control form-control-sm" v-model.number="r.value" :disabled="locked"></td>
                        <td><button v-if="!locked" type="button" class="btn btn-sm btn-link text-danger p-0" @click="rows.splice(i, 1)"><i class="fa-solid fa-trash"></i></button></td>
                    </tr>
                </tbody>
            </table>
            <div v-if="protocol.installments_manual && !locked" class="d-flex flex-wrap gap-2 align-items-center small">
                <button type="button" class="btn btn-sm btn-outline-dark" @click="addRow"><i class="fa-solid fa-plus"></i> Vencimento</button>
                <button type="button" class="btn btn-sm btn-outline-dark" @click="fillFromTerms">Preencher pela condição</button>
                <span :class="Math.abs(rowsTotal - total) > 0.01 ? 'text-danger' : 'text-success'">
                    Soma {{ brl(rowsTotal) }} de {{ brl(total) }}<span v-if="Math.abs(rowsTotal - total) > 0.01"> — precisa fechar para liberar</span>
                </span>
            </div>

            <div v-if="!protocol.installments_manual && preview.length" class="small text-muted">
                Ao liberar hoje: <span v-for="(p, i) in preview" :key="i" class="me-2">{{ br(p.due_date) }} {{ brl(p.value) }}</span>
                <span class="d-block">(os vencimentos contam a partir da liberação)</span>
            </div>
        </div>`,
    })
})()
