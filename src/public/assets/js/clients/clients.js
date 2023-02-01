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
            this.clients = this.clientsOrigin.filter(
                (v) => v.name.includes(this.q) || v.document.includes(this.q.replace(/[^a-zA-Z0-9 ]/g, '')),
            )
        },
        maskDocument(document) {
            document = document.replace(/[^a-zA-Z0-9 ]/g, '')

            if (document.length <= 11) return document.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/g, '$1.$2.$3-$4')
            else return document.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/g, '$1.$2.$3/$4-$5')
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
