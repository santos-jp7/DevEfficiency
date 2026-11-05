// Utilitários compartilhados pelas telas do CRM.
;(function () {
    const STAGES = ['Novo', 'Qualificado', 'Proposta', 'Negociação', 'Ganho', 'Perdido']
    const OPEN_STAGES = ['Novo', 'Qualificado', 'Proposta', 'Negociação']

    window.Crm = {
        STAGES,
        OPEN_STAGES,
        STAGE_COLORS: {
            Novo: '#6c757d',
            Qualificado: '#17a2b8',
            Proposta: '#0d6efd',
            Negociação: '#fd7e14',
            Ganho: '#28a745',
            Perdido: '#dc3545',
        },
        STAGE_PROBABILITY: { Novo: 10, Qualificado: 25, Proposta: 50, Negociação: 75, Ganho: 100, Perdido: 0 },
        SOURCES: ['Indicação', 'Site', 'WhatsApp', 'Instagram', 'Google', 'Evento', 'Parceiro', 'Outro'],
        LEAD_STATUSES: ['Ativo', 'Convertido', 'Descartado'],
        KINDS: ['Serviço', 'Produto/Licença', 'Assinatura'],
        LOST_REASONS: ['Preço', 'Concorrente', 'Sem orçamento', 'Sem resposta', 'Timing', 'Escopo', 'Outro'],
        ACTIVITY_TYPES: ['Ligação', 'Reunião', 'E-mail', 'WhatsApp', 'Tarefa', 'Nota'],
        ACTIVITY_ICONS: {
            Ligação: 'fa-phone',
            Reunião: 'fa-people-group',
            'E-mail': 'fa-envelope',
            WhatsApp: 'fa-comment',
            Tarefa: 'fa-list-check',
            Nota: 'fa-note-sticky',
        },

        // Cliente HTTP autenticado; redireciona para o login se a sessão expirou.
        api() {
            const token = localStorage.getItem('token')
            const expires_in = localStorage.getItem('expires_in')
            const type = localStorage.getItem('type')
            if (!token || !expires_in || !type || expires_in <= new Date().valueOf()) {
                location.href = '/'
                return null
            }
            return axios.create({ headers: { Authorization: [type, token].join(' ') } })
        },
        // Usuário logado (id do token), para o filtro "minhas".
        currentUserId() {
            try {
                const payload = JSON.parse(atob((localStorage.getItem('token') || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
                return (payload.user && payload.user.id) || null
            } catch (e) {
                return null
            }
        },
        params() {
            return Object.fromEntries(new URLSearchParams(window.location.search))
        },
        brl: (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v) || 0),
        brlFull: (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0),
        date: (v) => (v ? moment(v).format('DD/MM/YYYY') : '—'),
        dateTime: (v) => (v ? moment(v).format('DD/MM/YYYY HH:mm') : '—'),
        // Data de vencimento do follow-up com rótulo relativo.
        dueLabel(v) {
            if (!v) return ''
            const d = moment(v)
            if (d.isBefore(moment())) return 'Atrasado · ' + d.format('DD/MM HH:mm')
            if (d.isSame(moment(), 'day')) return 'Hoje · ' + d.format('HH:mm')
            return d.format('DD/MM HH:mm')
        },
        isOverdue: (v) => !!v && moment(v).isBefore(moment()),
        // Valor da oportunidade: o total do protocolo ligado quando existe, senão o estimado.
        valueOf: (o) => (o && o.protocol_value != null ? Number(o.protocol_value) : Number(o && o.estimated_value) || 0),
        hasValue: (o) => !!o && (o.protocol_value != null || o.estimated_value != null),
        // Nome de quem é a oportunidade: cliente (upsell) ou lead.
        partyName(o) {
            if (o?.Client) return o.Client.name
            if (o?.Lead) return o.Lead.company ? `${o.Lead.company} (${o.Lead.name})` : o.Lead.name
            return '—'
        },
        errorMessage: (e, fallback) => (e && e.response && e.response.data && e.response.data.message) || fallback || 'Ocorreu um erro.',
        toInputDateTime: (v) => (v ? moment(v).format('YYYY-MM-DDTHH:mm') : ''),
    }
})()
