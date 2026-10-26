// Utilidades compartilhadas pelas telas de vendedor (e reaproveitáveis no futuro painel do vendedor).
window.SellerUI = {
    brl(v) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
    },
    date(v) {
        return v ? moment(String(v).slice(0, 10)).format('DD/MM/YYYY') : ''
    },
    baseLabel(v) {
        return v === 'bruto' ? 'Base bruta' : 'Base líquida'
    },
    appliesLabel(v) {
        return { ambos: 'serviços e produtos', servicos: 'só serviços', produtos: 'só produtos' }[v] || v
    },
    statusColor(status) {
        return { 'Em aberto': 'primary', 'Liberado para pagamento': 'info', Fechado: 'success', Cancelado: 'danger' }[status] || 'secondary'
    },
    api() {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const type = localStorage.getItem('type')

        if (!token || !expires_in || !type || expires_in <= new Date().valueOf()) {
            location.href = '/'
            return null
        }

        const api = axios.create({ headers: { Authorization: [type, token].join(' ') } })
        api.get('/api/auth/verify').catch(() => {
            localStorage.clear()
            location.href = '/'
        })
        return api
    },
}
