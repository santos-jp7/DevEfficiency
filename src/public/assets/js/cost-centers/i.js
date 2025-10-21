let __api__ = null

const app = new Vue({
    el: '#app',
    data: {
        id: null,
        name: '',
        description: '',
        ParentId: null,
        allCostCenters: [], // For the parent dropdown
    },
    methods: {
        async saveCostCenter() {
            const isEditing = !!this.id
            const url = isEditing ? `/api/cost-centers/${this.id}` : '/api/cost-centers'
            const method = isEditing ? 'put' : 'post'

            const payload = {
                name: this.name,
                description: this.description,
                ParentId: this.ParentId,
            }

            try {
                await __api__[method](url, payload)
                alert('Centro de Custo salvo com sucesso!')
                location.href = './index.html'
            } catch (error) {
                console.error(error)
                alert(error.response?.data?.message || 'Erro ao salvar o centro de custo.')
            }
        },
        async deleteCostCenter() {
            if (!confirm('Tem certeza que deseja excluir? Todos os centros de custo filhos também serão removidos.')) {
                return
            }
            try {
                await __api__.delete(`/api/cost-centers/${this.id}`)
                alert('Centro de Custo excluído com sucesso!')
                location.href = './index.html'
            } catch (error) {
                console.error(error)
                alert(error.response?.data?.message || 'Erro ao excluir o centro de custo.')
            }
        },
        async fetchCostCenterData() {
            try {
                const { data } = await __api__.get(`/api/cost-centers/${this.id}`)
                this.name = data.name
                this.description = data.description
                this.ParentId = data.ParentId
            } catch (error) {
                console.error(error)
                alert('Erro ao carregar os dados.')
                location.href = './index.html'
            }
        },
        async fetchAllCostCentersForDropdown() {
            try {
                // We need a flat list for the dropdown
                const { data } = await __api__.get('/api/cost-centers')
                this.allCostCenters = this.flatten(data)
            } catch (error) {
                console.error('Error fetching all cost centers for dropdown:', error)
            }
        },
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

        this.fetchAllCostCentersForDropdown()

        const urlParams = new URLSearchParams(window.location.search)
        this.id = parseInt(urlParams.get('id'))

        if (this.id) {
            this.fetchCostCenterData()
        }
    },
})
