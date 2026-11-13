let __api__ = null

const app = new Vue({
    el: '#billing',
    data: {
        billing: {},
        id: null,
        currentProtocolId: null,
        currentValue: 0,
        sendingEmail: false,
        sendingReminder: false,
        receivedValue: null,
        supplierLines: [],
        supplierTotal: 0,

        bankAccounts: [],

        nfses: [],
        nfseDraft: null,
        nfseForm: { exterior: {} },
        nfseMode: 'emitir', // emitir | substituir
        nfseTarget: null, // nota substituída
        nfseCancel: null,
        nfseEmitting: false,
        nfseSyncing: false,
    },
    computed: {
        textoSelecionado() {
            return ((this.nfseDraft && this.nfseDraft.textos_padrao) || []).find((t) => t.id === this.nfseForm.texto_padrao_id) || null
        },
        // Descrição como sai na nota: itens + texto padrão escolhido.
        descricaoFinal() {
            const d = String(this.nfseForm.descricao || '').trim()
            return this.textoSelecionado ? `${d}\n\n${this.textoSelecionado.texto}` : d
        },
        // Nota autorizada ou aguardando confirmação: impede emitir outra para a mesma cobrança.
        activeNfse() {
            return this.nfses.find((n) => n.status === 'autorizada' || n.status === 'processando') || null
        },
        supplierAllocated() {
            return Math.round(this.supplierLines.reduce((s, l) => s + (Number(l.value) || 0), 0) * 100) / 100
        },
        supplierOverError() {
            const over = this.supplierLines.find((l) => (Number(l.value) || 0) > l.expected + 0.009 && !l.settle)
            return over ? `Protocolo #${over.ProtocolId}: valor acima do previsto — marque "valor final" para aceitar.` : ''
        },
        boletoFile() {
            if (!this.billing.BillingFiles) return null
            return [...this.billing.BillingFiles]
                .filter(f => f.type === 'boleto')
                .sort((a, b) => b.id - a.id)[0] || null
        },
        notaFiscalFile() {
            if (!this.billing.BillingFiles) return null
            return [...this.billing.BillingFiles]
                .filter(f => f.type === 'nota_fiscal')
                .sort((a, b) => b.id - a.id)[0] || null
        },
    },
    mounted() {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const type = localStorage.getItem('type')

        if (!token || !expires_in || !type) return (location.href = '/')
        if (expires_in <= new Date().valueOf()) return (location.href = '/')

        const params = new Proxy(new URLSearchParams(window.location.search), {
            get: (searchParams, prop) => searchParams.get(prop),
        })

        __api__ = axios.create({
            headers: {
                Authorization: [type, token].join(' '),
            },
        })

        if (params.id) {
            this.id = params.id

            __api__.get(`/api/billings/${params.id}`).then((res) => {
                this.billing = res.data
                if (this.billing.due_date) this.billing.due_date = moment.utc(this.billing.due_date).format('YYYY-MM-DD')
                if (this.billing.payment_date)
                    this.billing.payment_date = moment.utc(this.billing.payment_date).format('YYYY-MM-DD')
            })
            this.loadNfses()
        }

        __api__
            .get('/api/bank-accounts')
            .then((res) => {
                this.bankAccounts = res.data
            })
            .catch((err) => {
                console.error(err)

                alert('Erro ao carregar contas bancárias.')
            })
    },
    methods: {
        loadNfses() {
            return __api__.get('/api/nfse', { params: { BillingId: this.id } }).then((res) => (this.nfses = res.data))
        },
        nfseStatusClass: (s) => NfseFmt.statusClass(s),
        nfseDoc: (v) => NfseFmt.doc(v),
        openNfseFile: (id, kind) => NfseFiles.open(id, kind),
        locked(field) {
            return this.nfseMode === 'substituir' && ((this.nfseDraft && this.nfseDraft.bloqueados) || []).includes(field)
        },
        showNfseModal(data, mode) {
            this.nfseMode = mode
            this.nfseDraft = data
            const ext = data.defaults.exterior || {}
            this.nfseForm = {
                ...data.defaults,
                texto_padrao_id: data.defaults.texto_padrao_id || '',
                exterior: { ativo: false, nome: '', nif: '', cNaoNIF: '', cPais: '', cEndPost: '', xCidade: '', xEstProvReg: '', logradouro: '', numero: '', complemento: '', email: '', moeda: 'USD', valor_moeda: '', pais_resultado: true, ...ext },
            }
            bootstrap.Modal.getOrCreateInstance(document.getElementById('nfseModal')).show()
        },
        async openNfseModal() {
            try {
                const { data } = await __api__.get(`/api/billings/${this.id}/nfse/draft`)
                this.nfseTarget = null
                this.showNfseModal(data, 'emitir')
            } catch (err) {
                alert(err.response?.data?.message || 'Erro ao preparar a NFS-e.')
            }
        },
        async openSubstituteModal(n) {
            try {
                const { data } = await __api__.get(`/api/nfse/${n.id}/substitute/draft`)
                this.nfseTarget = n
                this.showNfseModal({ ...data, problems: [], warnings: [] }, 'substituir')
            } catch (err) {
                alert(err.response?.data?.message || 'Erro ao preparar a substituição.')
            }
        },
        openCancelModal(n) {
            this.nfseCancel = { id: n.id, numero_nfse: n.numero_nfse, cMotivo: '1', xMotivo: '' }
            bootstrap.Modal.getOrCreateInstance(document.getElementById('nfseCancelModal')).show()
        },
        async cancelNfse() {
            if (!confirm(`Cancelar definitivamente a NFS-e nº ${this.nfseCancel.numero_nfse}?`)) return
            this.nfseEmitting = true
            try {
                const { data } = await __api__.post(`/api/nfse/${this.nfseCancel.id}/cancel`, { cMotivo: this.nfseCancel.cMotivo, xMotivo: this.nfseCancel.xMotivo })
                bootstrap.Modal.getInstance(document.getElementById('nfseCancelModal')).hide()
                alert(data.status === 'cancelada' ? 'NFS-e cancelada.' : 'A Sefin não confirmou o cancelamento a tempo. Use "Verificar".')
                window.location.reload()
            } catch (err) {
                const d = err.response?.data
                alert([d?.message || 'Erro ao cancelar a NFS-e.', ...(Array.isArray(d?.details) ? d.details : [])].join('\n'))
            } finally {
                this.nfseEmitting = false
            }
        },
        async emitNfse() {
            const ext = this.nfseForm.exterior
            const nome = ext.ativo ? ext.nome || (this.nfseDraft.tomador && this.nfseDraft.tomador.nome) : this.nfseDraft.tomador && this.nfseDraft.tomador.nome
            const verb = this.nfseMode === 'emitir' ? 'Emitir a NFS-e' : `Substituir a NFS-e nº ${this.nfseDraft.original.numero_nfse} por uma nova`
            if (!confirm(`${verb} de ${this.formatCurrency(this.nfseForm.valor)} para ${nome}?`)) return
            this.nfseEmitting = true
            try {
                const body = { ...this.nfseForm, exterior: ext.ativo ? { ...ext, cPais: String(ext.cPais || '').toUpperCase() } : null }
                const url = this.nfseMode === 'emitir' ? `/api/billings/${this.id}/nfse` : `/api/nfse/${this.nfseTarget.id}/substitute`
                const { data } = await __api__.post(url, body)
                bootstrap.Modal.getInstance(document.getElementById('nfseModal')).hide()
                if (data.status === 'autorizada') alert(`NFS-e nº ${data.numero_nfse} autorizada.`)
                else if (data.status === 'rejeitada')
                    alert('A Sefin rejeitou a nota:\n' + (data.erros || []).map((e) => `${e.codigo} — ${e.descricao}`).join('\n'))
                else alert('A Sefin não respondeu a tempo. Use "Verificar" para confirmar se a nota foi gerada.')
                window.location.reload()
            } catch (err) {
                const d = err.response?.data
                alert([d?.message || 'Erro ao emitir a NFS-e.', ...(Array.isArray(d?.details) ? d.details : [])].join('\n'))
            } finally {
                this.nfseEmitting = false
            }
        },
        async syncNfse(n) {
            this.nfseSyncing = true
            try {
                const { data } = await __api__.post(`/api/nfse/${n.id}/sync`)
                if (data.status === 'autorizada') {
                    alert(`NFS-e nº ${data.numero_nfse} autorizada.`)
                    window.location.reload()
                } else {
                    Object.assign(n, data)
                    alert(`Situação: ${data.status}.`)
                }
            } catch (err) {
                alert(err.response?.data?.message || 'Erro ao verificar a NFS-e.')
            } finally {
                this.nfseSyncing = false
            }
        },
        openPdf(params) {
            PdfLink.open(params)
        },
        updateBilling() {
            __api__
                .put(`/api/billings/${this.id}`, this.billing)
                .then((res) => {
                    alert('Cobrança atualizada com sucesso!')
                    window.location.reload()
                })
                .catch((err) => {
                    alert('Erro ao atualizar cobrança.')
                    console.error(err)
                })
        },
        deleteBilling() {
            if (confirm('Tem certeza que deseja excluir esta cobrança?')) {
                __api__
                    .delete(`/api/billings/${this.id}`)
                    .then((res) => {
                        alert('Cobrança excluída com sucesso!')
                        window.location.href = './index.html'
                    })
                    .catch((err) => {
                        alert('Erro ao excluir cobrança.')
                        console.error(err)
                    })
            }
        },
        brl: (v) => Pricing.brl(v),
        pct: (v) => Pricing.percent(v),
        formatCurrency(value) {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
        },
        openValueModal(item) {
            this.currentProtocolId = item.id
            this.currentValue = item.value
            new bootstrap.Modal(document.getElementById('valueModal')).show()
        },
        updateValue() {
            __api__
                .put(`/api/billing-protocols/${this.currentProtocolId}`, { value: this.currentValue })
                .then((res) => {
                    // alert('Valor atualizado com sucesso!')
                    window.location.reload()
                })
                .catch((err) => {
                    alert('Erro ao atualizar valor.')
                    console.error(err)
                })
        },
        divideValue(x) {
            this.currentValue = (this.currentValue / x).toFixed(2)
        },
        reducePercentage(x) {
            this.currentValue = ((this.currentValue / 100) * x).toFixed(2)
        },
        async uploadFile(type, event) {
            const file = event.target.files[0]
            if (!file) return

            const formData = new FormData()
            formData.append('type', type)
            formData.append('file', file)

            try {
                const res = await __api__.post(`/api/billings/${this.id}/upload`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                })
                const data = res.data
                const file = data.billingFile || data
                if (!this.billing.BillingFiles) this.billing.BillingFiles = []
                this.billing.BillingFiles.push(file)
                if (data.billingStatus) this.billing.status = data.billingStatus
                alert('Arquivo enviado com sucesso!')
            } catch (err) {
                alert(err.response?.data?.message || 'Erro ao enviar arquivo.')
                console.error(err)
            }
            event.target.value = ''
        },
        async sendReminder() {
            if (!confirm('Enviar um lembrete desta cobrança agora aos contatos do cliente?')) return
            this.sendingReminder = true
            try {
                await __api__.post(`/api/billings/${this.id}/send-reminder`)
                alert('Lembrete enviado com sucesso!')
            } catch (err) {
                alert(err.response?.data?.message || 'Erro ao enviar lembrete.')
            } finally {
                this.sendingReminder = false
            }
        },
        async sendEmail() {
            if (!confirm('Enviar email com a fatura para todos os contatos do cliente?')) return
            this.sendingEmail = true
            try {
                await __api__.post(`/api/billings/${this.id}/send-email`)
                alert('Email enviado com sucesso!')
            } catch (err) {
                alert(err.response?.data?.message || 'Erro ao enviar email.')
                console.error(err)
            } finally {
                this.sendingEmail = false
            }
        },
        handlerBillingReceipt() {
            if (!this.billing.method) {
                alert('Selecione o método de pagamento.')
                return
            }

            if (!this.billing.BankAccountId) {
                alert('Selecione a conta bancária.')
                return
            }

            // Cobrança de fornecedor: valor por comissão (repasse parcial, parcelado ou diferente do previsto).
            if (this.billing.SupplierId) {
                this.supplierLines = (this.billing.BillingProtocols || [])
                    .slice()
                    .sort((a, b) => a.ProtocolId - b.ProtocolId || a.id - b.id)
                    .map((bp) => ({
                        BillingProtocolId: bp.id,
                        ProtocolId: bp.ProtocolId,
                        installment: bp.ProtocolInstallment ? bp.ProtocolInstallment.number : null,
                        label: bp.Protocol && bp.Protocol.notes ? bp.Protocol.notes : '',
                        expected: Number(bp.value) || 0,
                        value: Number(bp.value) || 0,
                        settle: false,
                    }))
                this.supplierTotal = Number(this.billing.total_value) || 0
                bootstrap.Modal.getOrCreateInstance(document.getElementById('supplierReceiptModal')).show()
                return
            }

            // Em atraso: o valor recebido precisa ser confirmado (e pode ser alterado) antes de finalizar.
            if (this.billing.late_charges && this.billing.late_charges.overdue) {
                this.receivedValue = this.billing.late_charges.total_with_charges
                bootstrap.Modal.getOrCreateInstance(document.getElementById('receiptModal')).show()
                return
            }

            if (
                !confirm(
                    `Confirma o recebimento de R$ ${this.formatCurrency(this.billing.total_value)} para esta cobrança?`,
                )
            )
                return

            this.postReceipt()
        },
        // Sugestão: preenche do protocolo mais antigo para o mais novo até acabar o valor recebido.
        distributeSupplierTotal() {
            let left = Math.round((Number(this.supplierTotal) || 0) * 100) / 100
            for (const line of this.supplierLines) {
                const v = Math.min(line.expected, left)
                line.value = Math.round(v * 100) / 100
                left = Math.round((left - v) * 100) / 100
            }
            // Sobrou (fornecedor pagou a mais): vai para a última linha, que precisa ser marcada como valor final.
            if (left > 0 && this.supplierLines.length) {
                const last = this.supplierLines[this.supplierLines.length - 1]
                last.value = Math.round((last.value + left) * 100) / 100
                last.settle = true
            }
        },
        confirmSupplierReceipt() {
            bootstrap.Modal.getInstance(document.getElementById('supplierReceiptModal')).hide()
            this.postReceipt(undefined, this.supplierLines.map((l) => ({ BillingProtocolId: l.BillingProtocolId, value: Number(l.value) || 0, settle: !!l.settle })))
        },
        confirmReceipt() {
            bootstrap.Modal.getInstance(document.getElementById('receiptModal')).hide()
            this.postReceipt(this.receivedValue)
        },
        postReceipt(receivedValue, allocations) {
            __api__
                .post(`/api/billing-receipt`, {
                    method: this.billing.method,
                    BankAccountId: this.billing.BankAccountId,
                    id: this.billing.id,
                    ...(receivedValue !== undefined ? { received_value: receivedValue } : {}),
                    ...(allocations ? { allocations } : {}),
                })
                .then((res) => {
                    alert('Cobrança recebida com sucesso!')
                    window.location.reload()
                })
                .catch((err) => {
                    alert(err.response.data.message || 'Erro ao receber cobrança.')
                    console.error(err)
                })
        },
        pctNum: (v) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(v) || 0),
    },
})
