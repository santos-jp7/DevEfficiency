let __api__ = null

const service_order = new Vue({
    el: '#subscription',
    data: {
        id: 0,
        name: null,
        status: null,
        dueAt: null,
        createdAt: null,
        ProjectId: null,
        ClientId: null,
        Project: {
            id: 0,
            name: null,
        },
        Client: {
            id: 0,
            name: null,
        },
        Protocols: [],
        Protocol: {
            id: null,
            status: null,
            Protocol_registers: [],
            Protocol_products: [],
            Receipts: [],
        },
    },
    methods: {
        handlerSubmit(e) {
            e.preventDefault()

            __api__
                .put('/api/subscriptions/' + this.$data.id, {
                    name: this.$data.name,
                    dueAt: this.$data.dueAt,
                })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
    },
    mounted: function () {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const type = localStorage.getItem('type')

        if (!token || !expires_in || !type) return (location.href = '/')
        if (expires_in <= new Date().valueOf()) return (location.href = '/')

        const params = new Proxy(new URLSearchParams(window.location.search), {
            get: (searchParams, prop) => searchParams.get(prop),
        })

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
            .get('/api/subscriptions/' + params.id)
            .then(({ data }) => {
                Object.keys(data).forEach((key) => (this.$data[key] = data[key]))

                console.log(data)

                __api__
                    .get('/api/protocols/' + data.Protocols[0].id)
                    .then(({ data }) => {
                        this.$data.Protocol = data
                    })
                    .catch((error) => {
                        console.log(error)

                        alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    })
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
