let __api__ = null

const blank = () => ({
    ClientId: null,
    ContactId: null,
    ProjectId: null,
    requester_name: '',
    requester_email: '',
    subject: '',
    description: '',
    type: 'Dúvida',
    gravidade: null,
    status: 'Aberto',
    messages: [],
})

new Vue({
    el: '#app',
    data: {
        id: null,
        ticket: blank(),
        clients: [],
        contacts: [],
        projects: [],
        types: TicketUI.types,
        reply: { body: '', internal: false },
        convert: { subject: '', gravidade: null, prazo: '' },
        sending: false,
        moment,
    },
    methods: {
        color: TicketUI.color,
        async loadClientData() {
            const clientId = this.ticket.ClientId
            this.contacts = []
            this.projects = []
            if (!clientId) return

            const [contacts, projects] = await Promise.all([
                __api__.get('/api/contacts', { params: { ClientId: clientId } }),
                __api__.get('/api/projects', { params: { ClientId: clientId } }),
            ])
            // Os endpoints listam tudo quando não filtram: garante o filtro no cliente também.
            this.contacts = (contacts.data || []).filter((c) => c.ClientId === clientId)
            this.projects = (projects.data || []).filter((p) => p.ClientId === clientId)
        },
        async onClientChange() {
            this.ticket.ContactId = null
            this.ticket.ProjectId = null
            await this.loadClientData()
        },
        onContactChange() {
            const contact = this.contacts.find((c) => c.id === this.ticket.ContactId)
            if (contact) {
                this.ticket.requester_name = contact.name
                this.ticket.requester_email = contact.email
            }
        },
        async load() {
            const { data } = await __api__.get(`/api/tickets/${this.id}`)
            this.ticket = Object.assign(blank(), data)
            await this.loadClientData()
        },
        async save() {
            try {
                if (!this.id) {
                    const { data } = await __api__.post('/api/tickets', this.ticket)
                    location.href = `./i.html?id=${data.id}`
                    return
                }

                await __api__.put(`/api/tickets/${this.id}`, this.ticket)
                alert('Chamado salvo.')
            } catch (error) {
                TicketUI.fail(error, 'Erro ao salvar o chamado.')
            }
        },
        async send() {
            if (!this.reply.body.trim()) return
            this.sending = true
            try {
                await __api__.post(`/api/tickets/${this.id}/messages`, this.reply)
                this.reply = { body: '', internal: false }
                await this.load()
            } catch (error) {
                TicketUI.fail(error, 'Erro ao enviar a mensagem.')
            } finally {
                this.sending = false
            }
        },
        async setStatus(status, note) {
            try {
                await __api__.post(`/api/tickets/${this.id}/status`, { status, note })
                await this.load()
            } catch (error) {
                TicketUI.fail(error, 'Erro ao alterar a situação.')
            }
        },
        resolve() {
            const note = prompt('Mensagem de resolução para o cliente (opcional). Ele receberá um e-mail:')
            if (note === null) return
            this.setStatus('Resolvido', note || undefined)
        },
        cancel() {
            if (confirm('Cancelar este chamado?')) this.setStatus('Cancelado')
        },
        openConvert() {
            this.convert = { subject: this.ticket.subject, gravidade: this.ticket.gravidade, prazo: '' }
            bootstrap.Modal.getOrCreateInstance(document.getElementById('convertModal')).show()
        },
        async doConvert() {
            try {
                const { data } = await __api__.post(`/api/tickets/${this.id}/convert`, {
                    subject: this.convert.subject,
                    gravidade: this.convert.gravidade || null,
                    prazo: this.convert.prazo || null,
                })
                location.href = `../service_orders/i.html?id=${data.ServiceOrderId}`
            } catch (error) {
                TicketUI.fail(error, 'Erro ao converter em OS.')
            }
        },
    },
    async mounted() {
        __api__ = TicketUI.api()
        if (!__api__) return

        this.id = new URLSearchParams(location.search).get('id')

        try {
            this.clients = (await __api__.get('/api/clients')).data || []
            if (this.id) await this.load()
        } catch (error) {
            TicketUI.fail(error, 'Erro ao carregar o chamado.')
        }
    },
})
