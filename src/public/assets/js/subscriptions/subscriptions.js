let __api__ = null

const subscriptions = new Vue({
    el: '#subscriptions',
    data: {
        subscriptionsOrigin: [],
        subscriptions: [],
        q: null,
        currentSort: 'name',
        currentSortDir: 'asc',
        currentStatus: [''],

        refs: {
            clients: [],
            projects: [],
            products: [],
        },
        newSub: {
            name: '',
            dueAt: '',
            ClientId: null,
            ProjectId: null,
            products: [],
        },
        saving: false,
    },
    methods: {
        handlerSearch() {
            this.subscriptions = this.subscriptionsOrigin.filter((v) => v.subject.includes(this.q))
        },

        sort: function (s) {
            if (s === this.currentSort) {
                this.currentSortDir = this.currentSortDir === 'asc' ? 'desc' : 'asc'
            }

            this.currentSort = s

            this.subscriptions = this.subscriptions.sort((a, b) => {
                let modifier = 1
                if (this.currentSortDir === 'desc') modifier = -1
                if (a[this.currentSort] < b[this.currentSort]) return -1 * modifier
                if (a[this.currentSort] > b[this.currentSort]) return 1 * modifier
                return 0
            })
        },

        exportToFile: function () {
            const o = document.getElementById('table-subscriptions')
            const tab = o.cloneNode(true)

            let tab_text = "<table border='2px'><tr>"

            for (let i = 0; i < tab.rows.length; i++) {
                tab.rows[i].deleteCell(5)
                tab_text = tab_text + tab.rows[i].innerHTML + '</tr>'
            }

            tab_text = tab_text + '</table>'
            tab_text = tab_text.replace(/<A[^>]*>|<\/A>/g, '')
            tab_text = tab_text.replace(/<img[^>]*>/gi, '')
            tab_text = tab_text.replace(/<input[^>]*>|<\/input>/gi, '')

            window.open('data:application/vnd.ms-excel,' + encodeURIComponent(tab_text))
        },

        openNewModal() {
            this.newSub = { name: '', dueAt: '', ClientId: null, ProjectId: null, products: [] }
            this.refs.projects = []
            const modal = new bootstrap.Modal(document.getElementById('newSubscriptionModal'))
            modal.show()
        },

        async loadProjects() {
            if (!this.newSub.ClientId) {
                this.refs.projects = []
                this.newSub.ProjectId = null
                return
            }
            try {
                const { data } = await __api__.get(`/api/projects?ClientId=${this.newSub.ClientId}`)
                this.refs.projects = data
                this.newSub.ProjectId = null
            } catch (err) {
                console.error(err)
            }
        },

        addProduct() {
            this.newSub.products.push({ ProductId: null, charge_type: 'Mensal', value: 0 })
        },

        removeProduct(idx) {
            this.newSub.products.splice(idx, 1)
        },

        fillProductValue(p) {
            const prod = this.refs.products.find((x) => x.id === p.ProductId)
            if (prod) p.value = prod.value
        },

        async createSubscription() {
            this.saving = true
            try {
                const { data } = await __api__.post('/api/subscriptions', {
                    name: this.newSub.name,
                    dueAt: this.newSub.dueAt,
                    ClientId: this.newSub.ClientId,
                    ProjectId: this.newSub.ProjectId || null,
                    products: this.newSub.products.filter((p) => p.ProductId),
                })
                bootstrap.Modal.getInstance(document.getElementById('newSubscriptionModal')).hide()
                this.subscriptionsOrigin.unshift(data)
                this.subscriptions = [...this.subscriptionsOrigin]
            } catch (err) {
                console.error(err)
                alert(err.response?.data?.message || 'Erro ao criar assinatura.')
            } finally {
                this.saving = false
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

        __api__.get('/api/auth/verify').catch((error) => {
            console.log(error)
            localStorage.clear()
            location.href = '/'
        })

        __api__
            .get('/api/subscriptions')
            .then(({ data }) => {
                this.$data.subscriptionsOrigin = data
                this.$data.subscriptions = data
            })
            .catch((error) => {
                console.log(error)
                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })

        Promise.all([
            __api__.get('/api/clients'),
            __api__.get('/api/products'),
        ]).then(([clientsRes, productsRes]) => {
            this.refs.clients = clientsRes.data
            this.refs.products = productsRes.data
        }).catch((err) => console.error('Erro ao carregar refs:', err))
    },
})
