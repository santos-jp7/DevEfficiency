let __api__ = null

new Vue({
    el: '#app',
    data: {
        tab: 'notas',
        settings: null,
        certificate: null,
        problems: [],
        form: {},
        saving: false,
        certFile: null,
        certPassword: '',
        savingCert: false,
        notas: [],
        statusFilter: '',
        syncing: null,
    },
    computed: {
        expiresSoon() {
            return this.certificate && moment(this.certificate.notAfter).diff(moment(), 'days') < 30
        },
    },
    methods: {
        brl: NfseFmt.brl,
        date: NfseFmt.date,
        doc: NfseFmt.doc,
        statusClass: NfseFmt.statusClass,
        openFile: (id, kind) => NfseFiles.open(id, kind),
        applySettings(data) {
            this.settings = data.settings
            this.certificate = data.certificate
            this.problems = data.problems || []
            this.form = { ...data.settings }
        },
        loadSettings() {
            return __api__.get('/api/nfse/settings').then(({ data }) => {
                this.applySettings(data)
                if (this.problems.length && !this.notas.length) this.tab = 'config'
            })
        },
        loadNotas() {
            return __api__.get('/api/nfse', { params: { status: this.statusFilter || undefined } }).then(({ data }) => (this.notas = data))
        },
        async save() {
            if (this.form.ambiente === 'producao' && this.settings.ambiente !== 'producao' &&
                !confirm('Mudar para PRODUÇÃO: as próximas notas terão valor fiscal. Confirma?')) return
            this.saving = true
            try {
                const { data } = await __api__.put('/api/nfse/settings', this.form)
                this.applySettings(data)
                alert('Configuração salva.')
            } catch (err) {
                alert(err.response?.data?.message || 'Erro ao salvar.')
            } finally {
                this.saving = false
            }
        },
        pickCert(event) {
            this.certFile = event.target.files[0] || null
        },
        async uploadCert() {
            this.savingCert = true
            try {
                const pfx = await new Promise((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload = () => resolve(reader.result)
                    reader.onerror = reject
                    reader.readAsDataURL(this.certFile)
                })
                const { data } = await __api__.post('/api/nfse/certificate', { pfx, password: this.certPassword })
                this.certificate = data.certificate
                this.problems = data.problems || []
                this.certPassword = ''
                alert('Certificado salvo.')
            } catch (err) {
                alert(err.response?.data?.message || 'Erro ao enviar o certificado.')
            } finally {
                this.savingCert = false
            }
        },
        async sync(n) {
            this.syncing = n.id
            try {
                const { data } = await __api__.post(`/api/nfse/${n.id}/sync`)
                Object.assign(n, data)
                alert(data.status === 'autorizada' ? `NFS-e nº ${data.numero_nfse} autorizada.` : `Situação: ${data.status}.`)
            } catch (err) {
                alert(err.response?.data?.message || 'Erro ao verificar.')
            } finally {
                this.syncing = null
            }
        },
    },
    mounted() {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const type = localStorage.getItem('type')
        if (!token || !expires_in || !type) return (location.href = '/')
        if (expires_in <= new Date().valueOf()) return (location.href = '/')
        __api__ = NfseApi()
        if (new URLSearchParams(location.search).get('tab') === 'config') this.tab = 'config'
        Promise.all([this.loadNotas(), this.loadSettings()]).catch((err) => {
            if (err.response?.status === 401) return (location.href = '/')
            alert(err.response?.data?.message || 'Erro ao carregar a NFS-e.')
        })
    },
})
