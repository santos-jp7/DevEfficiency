let __api__ = null

const dashboard = new Vue({
    el: '#dashboard',
    data: {
        service_orders: [],
        projects: [],
    },
    methods: {},
    mounted: function () {
        const token = localStorage.getItem('token')
        const expires_in = localStorage.getItem('expires_in')
        const type = localStorage.getItem('type')

        if (!token || !expires_in || !type) return (location.href = './')
        if (expires_in <= new Date().valueOf()) return (location.href = './')

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
            .get('/api/os')
            .then(({ data }) => {
                this.$data.service_orders = data
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })

        __api__
            .get('/api/projects')
            .then(({ data }) => {
                this.$data.projects = data
            })
            .catch((error) => {
                console.log(error)
                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
