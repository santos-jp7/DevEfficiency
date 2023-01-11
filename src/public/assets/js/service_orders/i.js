let __api__ = null

const service_order = new Vue({
    el: '#service_order',
    data: {
        id: 0,
        subject: null,
        description: null,
        status: null,
        createdAt: null,
        ProjectId: null,
        Protocol: {
            id: null,
            status: null,
            Protocol_registers: [],
            Receipts: [],
        },
    },
    methods: {
        handlerSubmit(e) {
            e.preventDefault()

            __api__
                .put('/api/os/' + this.$data.id, {
                    subject: this.$data.subject,
                    description: this.$data.description,
                    status: this.$data.status,
                })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => console.log(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.'))
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
            .get('/api/os/' + params.id)
            .then(({ data }) => {
                if (!data.Protocol) data.Protocol = {}

                data.Protocol.Protocol_registers = []
                data.Protocol.Receipts = []

                Object.keys(data).forEach((key) => (this.$data[key] = data[key]))

                __api__
                    .get('/api/protocols/' + data.Protocol.id)
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
