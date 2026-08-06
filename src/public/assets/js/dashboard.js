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
            bankBalance: 0,
            overdueBillingsCount: 0,
            overdueBillingsValue: 0,
            upcomingPayablesCount: 0,
            upcomingPayablesValue: 0,
            monthlyExpenses: 0,
            upcomingSubscriptionsCount: 0,
        },
        overdueBillings: [],
        upcomingPayables: [],
        upcomingSubscriptions: [],
        inProgressEntries: [],
        slaAtRiskOs: [],
        hasChartData: false,
    },
    filters: {
        currency(value) {
            if (typeof value !== 'number') return 'R$ 0,00'
            return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        },
        date(value) {
            if (!value) return '-'
            return moment.utc(value).format('DD/MM/YYYY')
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

                // SLA at-risk: breached or within 4h of solution deadline or prazo already past
                const now = new Date()
                const fourHoursMs = 4 * 3600000
                this.slaAtRiskOs = osResponse.data.filter((os) => {
                    if (os.sla_solution_deadline) {
                        const diff = new Date(os.sla_solution_deadline) - now
                        if (diff <= fourHoursMs) return true
                    }
                    if (os.prazo) {
                        const diff = new Date(os.prazo) - now
                        if (diff <= 0) return true
                    }
                    return false
                }).slice(0, 10)

                // Billings Metrics
                const { data: billings } = await __api__.get('/api/billings')
                const pendingBillings = billings.filter((b) => b.status === 'pendente' || b.status === 'faturada')
                this.metrics.billings.total_pending = pendingBillings.length
                this.metrics.billings.pending_value = pendingBillings.reduce((sum, b) => sum + parseFloat(b.total_value), 0)

                // Overdue billings (pendente + due_date < today)
                const today = moment().startOf('day')
                const threeDaysFromNow = moment().startOf('day').add(3, 'days')
                const sevenDaysFromNow = moment().startOf('day').add(7, 'days')

                const overdueBillingsAll = pendingBillings.filter(
                    (b) => b.due_date && moment.utc(b.due_date).isBefore(today),
                )
                this.metrics.overdueBillingsCount = overdueBillingsAll.length
                this.metrics.overdueBillingsValue = overdueBillingsAll.reduce((sum, b) => sum + parseFloat(b.total_value), 0)
                this.overdueBillings = overdueBillingsAll.slice(0, 10)

                // Subscriptions Metrics
                const { data: subscriptions } = await __api__.get('/api/subscriptions?complete=true')
                const activeSubs = subscriptions.filter((s) => s.status !== 'Cancelado')

                const allActiveSubs = subscriptions.filter((s) => s.status === 'Pago')
                this.metrics.subscriptions.total_active = allActiveSubs.length

                // MRR calculation
                let totalMrr = 0
                for (const sub of allActiveSubs) {
                    if (sub.Protocols && sub.Protocols.length > 0) {
                        const lastProtocol = sub.Protocols[0]
                        const value = (lastProtocol.Protocol_products || []).reduce((sum, r) => sum + parseFloat(r.value), 0)
                        totalMrr += value
                    }
                }
                this.metrics.subscriptions.mrr = totalMrr

                // Upcoming subscriptions (dueAt <= today+7, not cancelled)
                const upcomingSubs = activeSubs.filter(
                    (s) => s.dueAt && moment.utc(s.dueAt).isSameOrBefore(sevenDaysFromNow),
                )
                this.metrics.upcomingSubscriptionsCount = upcomingSubs.length
                this.upcomingSubscriptions = upcomingSubs.slice(0, 10)

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

                // Bank balance
                const { data: bankAccounts } = await __api__.get('/api/bank-accounts')
                this.metrics.bankBalance = bankAccounts.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0)

                // Payables metrics
                const { data: payables } = await __api__.get('/api/payables')
                const pendingPayables = payables.filter((p) => p.status === 'pendente')

                const upcomingPayablesAll = pendingPayables.filter(
                    (p) =>
                        p.dueDate &&
                        !moment.utc(p.dueDate).isBefore(today) &&
                        moment.utc(p.dueDate).isSameOrBefore(threeDaysFromNow),
                )
                this.metrics.upcomingPayablesCount = upcomingPayablesAll.length
                this.metrics.upcomingPayablesValue = upcomingPayablesAll.reduce((sum, p) => sum + parseFloat(p.value || 0), 0)
                this.upcomingPayables = upcomingPayablesAll.slice(0, 10)

                this.metrics.monthlyExpenses = pendingPayables
                    .filter(
                        (p) =>
                            p.dueDate &&
                            moment.utc(p.dueDate).isSameOrAfter(moment().startOf('month')) &&
                            moment.utc(p.dueDate).isSameOrBefore(moment().endOf('month')),
                    )
                    .reduce((sum, p) => sum + parseFloat(p.value || 0), 0)

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
        billingLabel(billing) {
            if (!billing.BillingProtocols || !billing.BillingProtocols.length) return 'Cobrança #' + billing.id
            const bp = billing.BillingProtocols[0]
            if (bp.Protocol && bp.Protocol.Service_order) return 'OS #' + bp.Protocol.ServiceOrderId
            if (bp.Protocol && bp.Protocol.Subscription) return bp.Protocol.Subscription.name
            return 'Cobrança #' + billing.id
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
                this.$data.recentsOs = data.data || data
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

        __api__
            .get('/api/os-entries?status=Em andamento')
            .then(({ data }) => {
                this.$data.inProgressEntries = data
            })
            .catch((error) => {
                console.log(error)
            })
    },
})
