// Itens do lançamento avulso (registros de serviço/despesa e produtos de cobrança única).
// Usado no modal de lançamento avulso e na conversão de oportunidades do CRM. Requer pricing.js (window.Pricing).
// Uso: <standalone-items :form="form" :products="products" :hourly-rate="120" :partner-percent="0"></standalone-items>
;(function () {
    const emptyRegister = () => ({
        type: 'Serviço',
        description: '',
        estimated_hours: null,
        hourly_rate: null,
        value: null,
        manual_override: false,
    })
    const emptyProduct = () => ({ ProductId: null, value: null, quantity: 1 })

    // Mesma conta do servidor (o servidor sempre recalcula ao gravar).
    function registerNet(r, hourlyRate, partnerPercent) {
        if (r.type === 'Serviço' && !r.manual_override) {
            if (!(Number(r.estimated_hours) > 0)) return 0
            return window.Pricing.calc(r.estimated_hours, r.hourly_rate || hourlyRate, partnerPercent).net
        }
        return Number(r.value) || 0
    }

    window.StandaloneItems = {
        emptyRegister,
        emptyProduct,
        registerNet,
        subtotal(form, hourlyRate, partnerPercent) {
            return (
                (form.registers || []).reduce((s, r) => s + registerNet(r, hourlyRate, partnerPercent), 0) +
                (form.products || []).reduce((s, p) => s + (Number(p.value) || 0) * (Number(p.quantity) || 1), 0)
            )
        },
        // Corpo para a API (linhas vazias ignoradas). error preenchido quando algo obrigatório falta.
        payload(form) {
            const registers = (form.registers || [])
                .filter((r) => r.description || r.estimated_hours || r.value)
                .map((r) => ({
                    type: r.type,
                    description: r.description,
                    ...(r.type === 'Serviço' && !r.manual_override
                        ? { estimated_hours: r.estimated_hours, hourly_rate: r.hourly_rate || undefined }
                        : { value: r.value, manual_override: r.type === 'Serviço' }),
                }))
            const products = (form.products || [])
                .filter((p) => p.ProductId)
                .map((p) => ({ ProductId: p.ProductId, value: p.value || 0, quantity: p.quantity || 1 }))

            const error = registers.some((r) => !r.description) ? 'Todo registro precisa de descrição.' : ''
            return { registers, products, error }
        },
    }

    Vue.component('standalone-items', {
        props: {
            form: { type: Object, required: true },
            products: { type: Array, default: () => [] },
            hourlyRate: { type: Number, default: 120 },
            partnerPercent: { type: Number, default: 0 },
        },
        methods: {
            brl: (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0),
            newRegister: emptyRegister,
            newProduct: emptyProduct,
            registerNet(r) {
                return registerNet(r, this.hourlyRate, this.partnerPercent)
            },
            toggleManual(r) {
                if (r.manual_override) r.value = this.registerNet({ ...r, manual_override: false }) || null
            },
            fillProduct(p) {
                const product = this.products.find((x) => x.id === p.ProductId)
                if (product && !p.value) p.value = Number(product.value) || null
            },
        },
        template: `
        <div>
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
            <div class="col-md-5">
                <label class="form-label small mb-0">Produto</label>
                <select class="form-select form-select-sm" v-model="p.ProductId" @change="fillProduct(p)">
                    <option :value="null" disabled>Selecione…</option>
                    <option v-for="pr in products" :value="pr.id">{{ pr.description }}</option>
                </select>
            </div>
            <div class="col-md-2">
                <label class="form-label small mb-0">Qtd.</label>
                <input type="number" step="1" min="1" max="500" class="form-control form-control-sm" v-model.number="p.quantity">
            </div>
            <div class="col-md-3">
                <label class="form-label small mb-0">Valor unitário (R$)</label>
                <input type="number" step="0.01" min="0" class="form-control form-control-sm" v-model.number="p.value">
            </div>
            <div class="col text-end">
                <div class="small fw-bold" v-if="p.quantity > 1">{{ brl((Number(p.value) || 0) * p.quantity) }}</div>
                <button type="button" class="btn btn-sm btn-link text-danger p-0" @click="form.products.splice(i, 1)"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
        </div>`,
    })
})()
