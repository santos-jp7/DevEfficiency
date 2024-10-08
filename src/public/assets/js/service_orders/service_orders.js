let __api__ = null

const service_orders = new Vue({
    el: '#service_orders',
    data: {
        service_ordersOrigin: [],
        service_orders: [],
        q: null,
        currentSort: 'name',
        currentSortDir: 'asc',
        currentStatus: [''],
    },
    methods: {
        handlerSearch() {
            this.service_orders = this.service_ordersOrigin.filter((v) => v.subject.includes(this.q))
        },

        sort: function (s) {
            console.log(s)

            if (s === this.currentSort) {
                this.currentSortDir = this.currentSortDir === 'asc' ? 'desc' : 'asc'
            }

            this.currentSort = s

            this.service_orders = this.service_orders.sort((a, b) => {
                let modifier = 1
                if (this.currentSortDir === 'desc') modifier = -1
                if (a[this.currentSort] < b[this.currentSort]) return -1 * modifier
                if (a[this.currentSort] > b[this.currentSort]) return 1 * modifier
                return 0
            })
        },

        exportToFile: function () {
            const o = document.getElementById('table-os')
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
            .get('/api/os')
            .then(({ data }) => {
                this.$data.service_ordersOrigin = data
                this.$data.service_orders = data
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
