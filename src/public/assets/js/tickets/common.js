window.TicketUI = {
    statuses: ['Aberto', 'Em análise', 'Aguardando cliente', 'Respondido', 'Convertido em OS', 'Resolvido', 'Cancelado'],
    types: ['Dúvida', 'Validação', 'Problema', 'Solicitação', 'Outro'],
    color: (s) =>
        ({ Aberto: 'danger', 'Em análise': 'warning', 'Aguardando cliente': 'secondary', Respondido: 'info', 'Convertido em OS': 'primary', Resolvido: 'success', Cancelado: 'dark' }[s] || 'secondary'),
    moment,
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
    fail: (error, fallback) => alert((error.response && error.response.data && error.response.data.message) || fallback),
}
