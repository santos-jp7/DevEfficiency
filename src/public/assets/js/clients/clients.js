let __api__ = null

const clients = new Vue({
    el: '#clients',
    data: {
        clientsOrigin: [],
        clients: [],
        q: null,
    },
    methods: {
        handlerSearch() {
            this.clients = this.clientsOrigin.filter((v) => v.name.includes(this.q))
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
            .get('/api/clients')
            .then(({ data }) => {
                this.$data.clientsOrigin = data
                this.$data.clients = data
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
