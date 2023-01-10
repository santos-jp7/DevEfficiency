let __api__ = null

const project = new Vue({
    el: '#project',
    data: {
        id: 0,
        name: null,
        url: null,
        type: null,
        ClientId: 0,
        Subprojects: [],
        Service_orders: [],
        payloads: {
            service_order: {
                subject: null,
                description: null,
            },
        },
    },
    methods: {
        handlerNewOs() {
            $('#newOsModal').modal('toggle')
        },
        handlerNewOsSubmit(e) {
            e.preventDefault()

            __api__
                .post('/api/os', {
                    subject: this.$data.payloads.service_order.subject,
                    description: this.$data.payloads.service_order.description,
                    projectId: this.$data.id,
                })
                .then(({ data }) => {
                    window.location.href = '/service_orders/i?id=' + data.id
                })
                .catch((e) =>
                    console.log(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.'),
                )
        },
    },
    mounted: function () {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const type = localStorage.getItem('type')

        if (!token || !expires_in || !type) return (location.href = './')
        if (expires_in <= new Date().valueOf()) return (location.href = './')

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

            location.href = './'
        })

        __api__
            .get('/api/projects/' + params.id)
            .then(({ data }) => {
                Object.keys(data).forEach((key) => (this.$data[key] = data[key]))
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
