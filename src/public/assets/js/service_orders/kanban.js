let __api__ = null

const kanban = new Vue({
    el: '#kanban',
    components: {
        draggable: window.vuedraggable,
    },
    data: {
        loading: false,
        statuses: [
            'Em avaliação',
            'Orçamento enviado',
            'Na fila',
            'Em correções',
            'Pendente',
            'Finalizado',
            'Cancelado',
        ],
        statusColors: {
            'Em avaliação': '#6c757d',
            'Orçamento enviado': '#17a2b8',
            'Na fila': '#ffc107',
            'Em correções': '#007bff',
            'Pendente': '#fd7e14',
            'Finalizado': '#28a745',
            'Cancelado': '#dc3545',
        },
        columns: {
            'Em avaliação': [],
            'Orçamento enviado': [],
            'Na fila': [],
            'Em correções': [],
            'Pendente': [],
            'Finalizado': [],
            'Cancelado': [],
        },
    },
    methods: {
        async fetchServiceOrders() {
            this.loading = true
            try {
                // Fetch all active OS (limit -1 to disable pagination for kanban)
                const { data: response } = await __api__.get('/api/os?limit=-1')
                
                // Clear columns
                this.statuses.forEach(s => this.columns[s] = [])

                // Group by status
                response.data.forEach((os) => {
                    if (this.columns[os.status]) {
                        this.columns[os.status].push(os)
                    }
                })
            } catch (error) {
                console.error('Error fetching OS:', error)
            } finally {
                this.loading = false
            }
        },
        async onDragChange(event, newStatus) {
            if (event.added) {
                const os = event.added.element
                console.log(`Updating OS #${os.id} to status: ${newStatus}`)
                
                try {
                    await __api__.put(`/api/os/${os.id}`, {
                        status: newStatus,
                        subject: os.subject,
                        description: os.description
                    })
                    // OS successfully updated on backend
                    // Note: If the backend triggers other actions (like closing protocols on 'Finalizado'),
                    // they are already handled by the serviceOrdersController.ts update method.
                } catch (error) {
                    console.error('Error updating OS status:', error)
                    alert('Erro ao atualizar status da OS. Verifique o console.')
                    // Rollback UI (simplest is to re-fetch)
                    this.fetchServiceOrders()
                }
            }
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

        this.fetchServiceOrders()
    },
})
