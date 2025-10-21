let __api__ = null

const app = new Vue({
    el: '#app',
    data: {
        // Payable fields
        id: null,
        description: '',
        value: 0.0,
        dueDate: null,
        paymentDate: null,
        status: 'pendente',
        SupplierId: null,
        BankAccountId: null,
        CostCenterId: null,

        // Data for selectors
        suppliers: [],
        costCenters: [],
        bankAccounts: [],
    },
    methods: {
        async savePayable() {
            const isEditing = !!this.id
            const url = isEditing ? `/api/payables/${this.id}` : '/api/payables'
            const method = isEditing ? 'put' : 'post'

            const payload = {
                description: this.description,
                value: this.value,
                dueDate: this.dueDate,
                paymentDate: this.paymentDate,
                status: this.status,
                SupplierId: this.SupplierId,
                BankAccountId: this.BankAccountId,
                CostCenterId: this.CostCenterId,
            }

            try {
                await __api__[method](url, payload)
                alert('Conta a pagar salva com sucesso!')
                location.href = './index.html'
            } catch (error) {
                console.error(error)
                alert(error.response?.data?.message || 'Erro ao salvar a conta a pagar.')
            }
        },
        async deletePayable() {
            if (!confirm('Tem certeza que deseja excluir esta conta?')) {
                return
            }
            try {
                await __api__.delete(`/api/payables/${this.id}`)
                alert('Conta a pagar excluída com sucesso!')
                location.href = './index.html'
            } catch (error) {
                console.error(error)
                alert(error.response?.data?.message || 'Erro ao excluir a conta a pagar.')
            }
        },
        async fetchPayableData() {
            try {
                const { data } = await __api__.get(`/api/payables/${this.id}`)
                this.description = data.description
                this.value = data.value
                this.dueDate = moment(data.dueDate).format('YYYY-MM-DD')
                this.paymentDate = data.paymentDate ? moment(data.paymentDate).format('YYYY-MM-DD') : null
                this.status = data.status
                this.SupplierId = data.SupplierId
                this.BankAccountId = data.BankAccountId
                this.CostCenterId = data.CostCenterId
            } catch (error) {
                console.error(error)
                alert('Erro ao carregar os dados da conta.')
                location.href = './index.html'
            }
        },
        async fetchDropdownData() {
            try {
                const [suppliersRes, costCentersRes, bankAccountsRes] = await Promise.all([
                    __api__.get('/api/suppliers'),
                    __api__.get('/api/cost-centers'),
                    __api__.get('/api/bank-accounts'),
                ])
                this.suppliers = suppliersRes.data
                this.costCenters = this.flatten(costCentersRes.data) // Use flatten for hierarchical cost centers
                this.bankAccounts = bankAccountsRes.data
            } catch (error) {
                console.error('Error fetching dropdown data:', error)
                alert('Erro ao carregar dados de suporte.')
            }
        },
        flatten(items, level = 0) {
            let result = []

            for (const item of items) {
                // 1. Adiciona a propriedade 'level' ao item atual
                // e a propriedade 'indentation' com o &nbsp; para o <select>
                const indentation = '—'.repeat(level) + (level > 0 ? ' ' : '')

                result.push({
                    ...item,
                    level: level,
                    indentation: indentation, // Ex: "— " para filhos, "—— " para netos, etc.
                })

                // 2. Chamada recursiva para os filhos, incrementando o nível
                if (item.children && item.children.length > 0) {
                    // Se você estiver em uma classe, use `this.flatten`
                    // Se for uma função pura, use apenas `flatten`
                    const subItems = this.flatten(item.children, level + 1)
                    result = result.concat(subItems)
                }
            }
            return result
        },
    },
    mounted: function () {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const type = localStorage.getItem('type')

        if (!token || !expires_in || !type) return (location.href = '/')
        if (expires_in <= new Date().valueOf()) return (location.href = '/')

        __api__ = axios.create({
            headers: {
                Authorization: [type, token].join(' '),
            },
        })

        __api__.get('/api/auth/verify').catch(() => {
            localStorage.clear()
            location.href = '/'
        })

        this.fetchDropdownData()

        const urlParams = new URLSearchParams(window.location.search)
        this.id = urlParams.get('id')

        if (this.id) {
            this.fetchPayableData()
        }
    },
})
