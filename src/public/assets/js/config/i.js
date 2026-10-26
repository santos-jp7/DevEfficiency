let __api__ = null

const configForm = new Vue({
    el: '#config-form',
    data: {
        config: {
            type: '',
            value: '',
            upload: false, // Initialize upload flag
        },
        isEditing: false,
        sendingAlert: false,
    },
    methods: {
        async previewReminders() {
            try {
                const { data } = await __api__.get('/api/billing-reminders/preview')
                const money = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
                if (!data.planned.length) return alert(`Nenhum lembrete a enviar agora (${data.checked} cobrança(s) faturada(s) analisada(s)).`)
                alert(
                    `${data.planned.length} lembrete(s) sairiam agora:\n\n` +
                        data.planned
                            .slice(0, 25)
                            .map((p) => `#${p.billingId} ${p.client} — ${money(p.value)} — venc. ${p.due_date} (${p.days >= 0 ? p.days + ' dias de atraso' : -p.days + ' dias para vencer'}) → ${p.to.join(', ') || 'SEM E-MAIL'}`)
                            .join('\n'),
                )
            } catch (error) {
                alert(error.response?.data?.message || 'Não foi possível simular.')
            }
        },
        async sendTestAlert() {
            this.sendingAlert = true
            try {
                const { data } = await __api__.post('/api/payables-alert/send')
                alert(
                    data.sent
                        ? `Aviso enviado para ${data.to.join(', ')} (${data.count} conta(s)).`
                        : data.reason || 'Nada para enviar.',
                )
            } catch (error) {
                alert(error.response?.data?.message || 'Não foi possível enviar o aviso.')
            } finally {
                this.sendingAlert = false
            }
        },
        async saveConfig() {
            try {
                const url = `/api/config/${this.config.type}`
                
                await __api__.post(url, { value: this.config.value, upload: this.config.upload }) // Send upload flag

                alert('Configuração salva com sucesso!')
                location.href = '../config/index.html' // Redirect back to the list
            } catch (error) {
                console.error(error)
                alert(error.response.data.message || 'Ocorreu um erro ao salvar a configuração. Tente novamente mais tarde.')
            }
        },
        async fetchConfig(type) {
            try {
                const { data } = await __api__.get(`/api/config/${type}`)
                this.config.type = data.type
                this.config.value = data.value
                this.config.upload = data.upload // Populate upload flag
            } catch (error) {
                console.error(error)
                alert(error.response.data.message || 'Ocorreu um erro ao carregar a configuração. Tente novamente mais tarde.')
            }
        },
        handleFileUpload(event) {
            const file = event.target.files[0]
            if (!file) {
                this.config.value = ''
                return
            }

            const reader = new FileReader()
            reader.onload = (e) => {
                this.config.value = e.target.result // Base64 string
            }
            reader.readAsDataURL(file)
        },
        getQueryParams() {
            const params = {}
            window.location.search.substring(1).split('&').forEach(param => {
                const parts = param.split('=')
                if (parts[0] && parts[1]) {
                    params[parts[0]] = decodeURIComponent(parts[1])
                }
            })
            return params
        }
    },
    mounted: async function () {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const authType = localStorage.getItem('type') // This 'authType' is for auth, not config type

        if (!token || !expires_in || !authType) return (location.href = '/')
        if (expires_in <= new Date().valueOf()) return (location.href = '/')

        __api__ = axios.create({
            headers: {
                Authorization: [authType, token].join(' '),
            },
        })

        try {
            await __api__.get('/api/auth/verify')
        } catch (error) {
            console.error(error)
            localStorage.clear()
            location.href = '/'
        }

        const params = this.getQueryParams()
        if (params.type) {
            this.isEditing = true
            this.config.type = params.type // Set type from URL for display
            await this.fetchConfig(params.type)
        }
    },
})
