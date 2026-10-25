let __api__ = null

const TABS = ['inadimplencia', 'vendas', 'recorrencia']

new Vue({
    el: '#app',
    data: {
        tab: TABS.includes(new URLSearchParams(location.search).get('tab')) ? new URLSearchParams(location.search).get('tab') : 'inadimplencia',
        delinquency: null,
        sales: null,
        recurrence: null,
        onlyInvoiced: false,
        open: {},
        range: { startDate: moment().startOf('month').format('YYYY-MM-DD'), endDate: moment().endOf('month').format('YYYY-MM-DD') },
    },
    methods: {
        brl: (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0),
        pct: (v) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(v) || 0) + '%',
        date: (v) => (v ? moment.utc(v).format('DD/MM/YYYY') : '—'),
        toggle(id) {
            this.$set(this.open, id, !this.open[id])
        },
        go(tab) {
            this.tab = tab
            history.replaceState(null, '', `?tab=${tab}`)
            this.load()
        },
        fail(error) {
            alert((error.response && error.response.data && error.response.data.message) || 'Erro ao carregar o relatório.')
        },
        async loadDelinquency() {
            const params = this.onlyInvoiced ? { status: 'faturada' } : {}
            this.delinquency = (await __api__.get('/api/reports/delinquency', { params })).data
        },
        async loadSales() {
            this.sales = (await __api__.get('/api/reports/sales', { params: this.range })).data
        },
        async loadRecurrence() {
            this.recurrence = (await __api__.get('/api/reports/recurrence')).data
        },
        async load() {
            try {
                if (this.tab === 'inadimplencia') await this.loadDelinquency()
                if (this.tab === 'vendas') await this.loadSales()
                if (this.tab === 'recorrencia') await this.loadRecurrence()
            } catch (error) {
                this.fail(error)
            }
        },
        exportCsv(tab) {
            const rows = {
                inadimplencia: () => [
                    ['Cliente', 'Cobrança', 'Situação', 'Vencimento', 'Dias de atraso', 'Valor'],
                    ...this.delinquency.clients.flatMap((c) => c.billings.map((b) => [c.client, b.id, b.status, b.due_date, b.days_overdue, b.value])),
                ],
                vendas: () => [
                    ['Origem', 'Protocolos', 'Vendas', '% das vendas', 'Comissão gerada', 'Comissão paga', 'Comissão a pagar'],
                    ...this.sales.sellers.map((s) => [s.name, s.protocols, s.sales, s.share, s.commission_generated, s.commission_paid, s.commission_pending]),
                ],
                recorrencia: () => [
                    ['Assinatura', 'Cliente', 'Ciclo', 'Situação', 'Vencimento', 'Valor do ciclo', 'MRR'],
                    ...this.recurrence.subscriptions.map((s) => [s.name, s.client, s.cycle, s.status, moment.utc(s.dueAt).format('YYYY-MM-DD'), s.value, s.mrr]),
                ],
            }[tab]()

            const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
            const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')
            const link = document.createElement('a')
            link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
            link.download = `relatorio-${tab}-${moment().format('YYYYMMDD')}.csv`
            link.click()
        },
    },
    mounted() {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const type = localStorage.getItem('type')

        if (!token || !expires_in || !type || expires_in <= new Date().valueOf()) return (location.href = '/')

        __api__ = axios.create({ headers: { Authorization: [type, token].join(' ') } })
        __api__.get('/api/auth/verify').catch(() => {
            localStorage.clear()
            location.href = '/'
        })

        this.load()
    },
})
