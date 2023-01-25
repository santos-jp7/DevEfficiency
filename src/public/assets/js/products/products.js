let __api__ = null

const products = new Vue({
    el: '#products',
    data: {
        productsOrigin: [],
        products: [],
        q: null,
    },
    methods: {
        handlerSearch() {
            this.products = this.productsOrigin.filter((v) => v.name.includes(this.q))
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
            .get('/api/products')
            .then(({ data }) => {
                this.$data.productsOrigin = data
                this.$data.products = data
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
