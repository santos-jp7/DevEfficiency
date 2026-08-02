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
        recurrence: null,
        total_installments: null,
        current_installment: null,

        // Data for selectors
        suppliers: [],
        costCenters: [],
        bankAccounts: [],

        // Reimbursement
        reimbursement: null,
        showReimbursementModal: false,
        savingReimbursement: false,
        reimbursementForm: { description: '', value: null, BankAccountId: '', SupplierId: '' },
        reimbursementFileToUpload: null,
        newReimbursementFile: null,
    },
    computed: {
        recurrenceLabel() {
            const labels = {
                quinzenal: 'quinzenal (+15 dias)',
                mensal: 'mensal (+1 mês)',
                trimestral: 'trimestral (+3 meses)',
                semestral: 'semestral (+6 meses)',
                anual: 'anual (+1 ano)',
                bianual: 'bianual (+2 anos)',
                trianual: 'trianual (+3 anos)',
            }
            return labels[this.recurrence] || ''
        },
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
                recurrence: this.recurrence || null,
                total_installments: this.total_installments || null,
                current_installment: this.current_installment || null,
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
                this.dueDate = moment.utc(data.dueDate).format('YYYY-MM-DD')
                this.paymentDate = data.paymentDate ? moment.utc(data.paymentDate).format('YYYY-MM-DD') : null
                this.status = data.status
                this.SupplierId = data.SupplierId
                this.BankAccountId = data.BankAccountId
                this.CostCenterId = data.CostCenterId
                this.recurrence = data.recurrence || null
                this.total_installments = data.total_installments || null
                this.current_installment = data.current_installment || null
                this.reimbursement = data.Reimbursement || null
                if (this.reimbursement && this.reimbursement.SupplierId) {
                    this.reimbursementForm.SupplierId = this.reimbursement.SupplierId
                } else {
                    this.reimbursementForm.SupplierId = data.SupplierId
                }
            } catch (error) {
                console.error(error)
                alert('Erro ao carregar os dados da conta.')
                location.href = './index.html'
            }
        },
        async createReimbursement() {
            if (!this.reimbursementForm.description || !this.reimbursementForm.value || !this.reimbursementForm.BankAccountId) {
                alert('Preencha descrição, valor e conta bancária.')
                return
            }
            this.savingReimbursement = true
            try {
                const { data } = await __api__.post('/api/reimbursements', {
                    description: this.reimbursementForm.description,
                    value: this.reimbursementForm.value,
                    PayableId: parseInt(this.id),
                    BankAccountId: this.reimbursementForm.BankAccountId,
                    SupplierId: this.reimbursementForm.SupplierId || null,
                })
                if (this.newReimbursementFile) {
                    const form = new FormData()
                    form.append('file', this.newReimbursementFile)
                    await __api__.post(`/api/reimbursements/${data.id}/upload`, form, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                    })
                }
                this.showReimbursementModal = false
                this.reimbursementForm = { description: '', value: null, BankAccountId: '', SupplierId: '' }
                this.newReimbursementFile = null
                await this.fetchPayableData()
                alert('Ressarcimento registrado com sucesso!')
            } catch (error) {
                console.error(error)
                alert(error.response?.data?.error || 'Erro ao registrar ressarcimento.')
            } finally {
                this.savingReimbursement = false
            }
        },
        async deleteReimbursement() {
            if (!confirm('Excluir o ressarcimento? O valor será revertido da conta bancária.')) return
            try {
                await __api__.delete(`/api/reimbursements/${this.reimbursement.id}`)
                this.reimbursement = null
                alert('Ressarcimento excluído.')
            } catch (error) {
                console.error(error)
                alert(error.response?.data?.error || 'Erro ao excluir ressarcimento.')
            }
        },
        handleReimbursementFileChange(event) {
            this.reimbursementFileToUpload = event.target.files[0] || null
        },
        handleNewReimbursementFileChange(event) {
            this.newReimbursementFile = event.target.files[0] || null
        },
        async uploadReimbursementFile() {
            if (!this.reimbursementFileToUpload || !this.reimbursement) return
            try {
                const form = new FormData()
                form.append('file', this.reimbursementFileToUpload)
                await __api__.post(`/api/reimbursements/${this.reimbursement.id}/upload`, form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                })
                this.reimbursementFileToUpload = null
                if (this.$refs.reimbursementFileInput) this.$refs.reimbursementFileInput.value = ''
                await this.fetchPayableData()
                alert('Comprovante enviado com sucesso!')
            } catch (error) {
                console.error(error)
                alert('Erro ao enviar comprovante.')
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
