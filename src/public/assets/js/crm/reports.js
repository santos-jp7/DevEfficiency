let __api__ = null

new Vue({
    el: '#app',
    data: {
        Crm: window.Crm,
        report: null,
        loading: false,
        sellers: [],
        sources: [...window.Crm.SOURCES, 'Cliente existente'],
        startDate: moment().startOf('month').format('YYYY-MM-DD'),
        endDate: moment().endOf('month').format('YYYY-MM-DD'),
        SellerId: '',
        source: '',
        tables: [
            { key: 'by_seller', title: 'Por vendedor', label: 'Vendedor' },
            { key: 'by_source', title: 'Por origem', label: 'Origem' },
        ],
    },
    methods: {
        pct: (v) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(v) || 0)}%`,
        days: (v) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(v) || 0)} dia(s)`,
        monthLabel: (m) => moment(m + '-01').format('MM/YYYY'),
        barWidth(v) {
            const max = Math.max(...this.report.pipeline.stages.map((s) => s.value), 0)
            return max > 0 ? Math.max((v / max) * 100, v > 0 ? 2 : 0) : 0
        },
        preset(kind) {
            const unit = { month: 'month', quarter: 'quarter', year: 'year' }[kind]
            this.startDate = moment().startOf(unit).format('YYYY-MM-DD')
            this.endDate = moment().endOf(unit).format('YYYY-MM-DD')
            this.load()
        },
        async load() {
            this.loading = true
            try {
                const params = { startDate: this.startDate, endDate: this.endDate }
                if (this.SellerId) params.SellerId = this.SellerId
                if (this.source) params.source = this.source
                const { data } = await __api__.get('/api/crm/reports', { params })
                this.report = data
            } catch (e) {
                alert(Crm.errorMessage(e, 'Não foi possível carregar o relatório.'))
            } finally {
                this.loading = false
            }
        },
        // CSV das tabelas por vendedor e por origem (separador ; para abrir direto no Excel em pt-BR).
        exportCsv() {
            const num = (v) => String(Number(v) || 0).replace('.', ',')
            const lines = [['Agrupamento', 'Nome', 'Abertas', 'Valor em aberto', 'Ganhas', 'Valor ganho', 'Perdidas', 'Conversão %']]
            for (const t of this.tables)
                for (const g of this.report[t.key])
                    lines.push([t.label, g.name, g.open_count, num(g.open_value), g.won, num(g.won_value), g.lost, num(g.conversion_rate)])
            const csv = lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = `crm-vendas-${this.startDate}_${this.endDate}.csv`
            link.click()
            URL.revokeObjectURL(link.href)
        },
    },
    mounted() {
        __api__ = Crm.api()
        if (!__api__) return
        __api__.get('/api/sellers').then(({ data }) => (this.sellers = data || [])).catch(() => {})
        this.load()
    },
})
