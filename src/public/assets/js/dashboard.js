let __api__ = null

const dashboard = new Vue({
    el: '#dashboard',
    data: {
        currentOs: {
            id: null,
            subject: null,
            Project: {
                id: null,
                name: null,
                Client: {
                    id: null,
                    name: null,
                },
            },
        },
        recentsOs: [],
        fixedProjects: [],
        metrics: {
            os: {
                total_open: 0,
                in_progress: 0,
            },
            billings: {
                pending_value: 0,
                total_pending: 0,
            },
            subscriptions: {
                total_active: 0,
                mrr: 0,
            },
            cashFlow: {
                inflow: 0,
                outflow: 0,
                balance: 0,
            },
        },
        hasChartData: false,
    },
    filters: {
        currency(value) {
            if (typeof value !== 'number') return 'R$ 0,00'
            return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        },
    },
    methods: {
        async fetchMetrics() {
            try {
                // OS Metrics - Fetching non-finalized OS
                const openStatuses = ['Em avaliação', 'Orçamento enviado', 'Na fila', 'Em correções', 'Pendente']
                const { data: osResponse } = await __api__.get(`/api/os?status=${openStatuses.join(',')}&limit=100`)
                
                this.metrics.os.total_open = osResponse.total
                this.metrics.os.in_progress = osResponse.data.filter((os) => os.status === 'Em correções').length
                
                // If there are more than 100, the totals are still correct from the API.

                // Billings Metrics
                const { data: billings } = await __api__.get('/api/billings')
                const pendingBillings = billings.filter((b) => b.status === 'pendente')
                this.metrics.billings.total_pending = pendingBillings.length
                this.metrics.billings.pending_value = pendingBillings.reduce((sum, b) => sum + b.total_value, 0)

                // Subscriptions Metrics
                const { data: subscriptions } = await __api__.get('/api/subscriptions')
                const activeSubs = subscriptions.filter((s) => s.status === 'Pago') // Assuming 'Pago' means active/active monthly
                this.metrics.subscriptions.total_active = activeSubs.length
                
                // MRR calculation (Sum of last protocol value for each subscription)
                let totalMrr = 0
                for (const sub of activeSubs) {
                    const { data: subDetail } = await __api__.get(`/api/subscriptions/${sub.id}`)
                    if (subDetail.Protocols && subDetail.Protocols.length > 0) {
                        const lastProtocol = subDetail.Protocols[0]
                        const { data: protocolDetail } = await __api__.get(`/api/protocols/${lastProtocol.id}`)
                        const value = (protocolDetail.Protocol_registers || []).reduce((sum, r) => sum + r.value, 0)
                        totalMrr += value
                    }
                }
                this.metrics.subscriptions.mrr = totalMrr

                // Cash Flow Metrics (Current Month)
                const startOfMonth = moment().startOf('month').format('YYYY-MM-DD')
                const endOfMonth = moment().endOf('month').format('YYYY-MM-DD')
                const { data: history } = await __api__.get(
                    `/api/financial-history?startDate=${startOfMonth}&endDate=${endOfMonth}`,
                )

                this.metrics.cashFlow.inflow = history.filter((t) => t.type === 'inflow').reduce((sum, t) => sum + t.value, 0)
                this.metrics.cashFlow.outflow = Math.abs(
                    history.filter((t) => t.type === 'outflow').reduce((sum, t) => sum + t.value, 0),
                )
                this.metrics.cashFlow.balance = this.metrics.cashFlow.inflow - this.metrics.cashFlow.outflow

                this.hasChartData = true
                this.$nextTick(() => {
                    this.renderCharts(history, osResponse.data)
                })
            } catch (error) {
                console.error('Error fetching metrics:', error)
            }
        },
        renderCharts(history, osList) {
            // Cash Flow Chart
            const ctxCash = document.getElementById('cashFlowChart').getContext('2d')
            new Chart(ctxCash, {
                type: 'bar',
                data: {
                    labels: ['Entradas', 'Saídas'],
                    datasets: [
                        {
                            label: 'Valor',
                            data: [this.metrics.cashFlow.inflow, this.metrics.cashFlow.outflow],
                            backgroundColor: ['#28a745', '#dc3545'],
                        },
                    ],
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                    },
                },
            })

            // OS Status Chart
            const osStatuses = osList.reduce((acc, os) => {
                acc[os.status] = (acc[os.status] || 0) + 1
                return acc
            }, {})

            const colors = {
                'Em avaliação': '#6c757d',
                'Orçamento enviado': '#17a2b8',
                'Na fila': '#ffc107',
                'Em correções': '#007bff',
                'Pendente': '#fd7e14',
                'Finalizado': '#28a745',
                'Cancelado': '#dc3545',
            }

            const ctxOs = document.getElementById('osStatusChart').getContext('2d')
            new Chart(ctxOs, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(osStatuses),
                    datasets: [
                        {
                            data: Object.values(osStatuses),
                            backgroundColor: Object.keys(osStatuses).map((status) => colors[status] || '#cbd5e0'),
                        },
                    ],
                },
                options: {
                    responsive: true,
                },
            })
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

        __api__.get('/api/auth/verify').catch((error) => {
            console.log(error)

            localStorage.clear()

            location.href = '/'
        })

        this.fetchMetrics()

        __api__
            .get('/api/utils/currentOs')
            .then(({ data }) => {
                this.$data.currentOs = data
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })

        __api__
            .get('/api/os?filter=last_three')
            .then(({ data }) => {
                this.$data.recentsOs = data.data || data // Handles both paginated and flat response
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })

        __api__
            .get('/api/projects?filter=fixed')
            .then(({ data }) => {
                this.$data.fixedProjects = data
            })
            .catch((error) => {
                console.log(error)
                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
