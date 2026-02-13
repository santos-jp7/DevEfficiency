let __api__ = null

const configs = new Vue({
    el: '#configs',
    data: {
        configs: [],
    },
    methods: {
        // No specific methods for search for now, as there's no search input
    },
    mounted: function () {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const type = localStorage.getItem('type') // This 'type' is for auth, not config type

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
            .get('/api/config') // Fetch all configurations
            .then(({ data }) => {
                this.$data.configs = data
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro ao carregar as configurações. Tente novamente mais tarde.')
            })
    },
})
