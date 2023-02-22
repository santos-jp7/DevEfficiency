let __api__ = null

const project = new Vue({
    el: '#server',
    data: {
        id: 0,
        description: null,
        provider: null,
        host: null,
        username: null,
        password: null,
        rsa: null,
        ClientId: null,
        Client: {
            name: null,
        },
    },
    methods: {
        handlerSubmit(e) {
            e.preventDefault()

            let method = this.$data.id ? __api__.put : __api__.post
            let url = this.$data.id ? '/api/servers/' + this.$data.id : '/api/servers'

            method(url, {
                description: this.$data.description,
                provider: this.$data.provider,
                host: this.$data.host,
                username: this.$data.username,
                password: this.$data.password,
                rsa: this.$data.rsa,
            })
                .then(({ data }) => {
                    window.location.href = '/servers/i?id=' + data.id
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
            .get('/api/servers/' + params.id)
            .then(({ data }) => {
                Object.keys(data).forEach((key) => (this.$data[key] = data[key]))
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
