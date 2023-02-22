let __api__ = null

const servers = new Vue({
    el: '#servers',
    data: {
        serversOrigin: [],
        servers: [],
        q: null,
    },
    methods: {
        handlerSearch() {
            this.servers = this.serversOrigin.filter((v) => v.description.includes(this.q))
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
            .get('/api/servers')
            .then(({ data }) => {
                this.$data.serversOrigin = data
                this.$data.servers = data
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
