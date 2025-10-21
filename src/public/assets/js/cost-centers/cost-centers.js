let __api__ = null

const app = new Vue({
    el: '#app',
    data: {
        costCenters: [],
    },
    methods: {
        // Helper to convert hierarchical data to a flat list for rendering
        flatten(items, level = 0) {
            let result = []

            for (const item of items) {
                // 1. Adiciona a propriedade 'level' ao item atual
                // e a propriedade 'indentation' com o &nbsp; para o <select>
                const indentation = '—'.repeat(level) + (level > 0 ? ' ' : '')

                result.push({
                    ...item,
                    level: level,
                    indentation: indentation, // Ex: "— " para filhos, "—— " para netos, etc.
                })

                // 2. Chamada recursiva para os filhos, incrementando o nível
                if (item.children && item.children.length > 0) {
                    // Se você estiver em uma classe, use `this.flatten`
                    // Se for uma função pura, use apenas `flatten`
                    const subItems = this.flatten(item.children, level + 1)
                    result = result.concat(subItems)
                }
            }
            return result
        },
        getParentName(parentId) {
            if (!parentId) return '-'
            const parent = this.costCenters.find((cc) => cc.id === parentId)
            return parent ? parent.name : '-'
        },
        formatCurrency(value) {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
        },
        async fetchData() {
            try {
                const response = await __api__.get('/api/cost-centers')
                // The API returns a hierarchical structure, we flatten it for the table
                this.costCenters = this.flatten(response.data)
            } catch (error) {
                console.error('Error fetching cost centers:', error)
                alert('Não foi possível carregar os centros de custo.')
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

        __api__.get('/api/auth/verify').catch(() => {
            localStorage.clear()
            location.href = '/'
        })

        this.fetchData()
    },
})
