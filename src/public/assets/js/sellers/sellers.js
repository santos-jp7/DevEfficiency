let __api__ = null

new Vue({
    el: '#app',
    data: { sellers: [] },
    methods: Object.assign({}, SellerUI),
    mounted() {
        __api__ = SellerUI.api()
        if (!__api__) return

        __api__
            .get('/api/sellers')
            .then(({ data }) => (this.sellers = data))
            .catch((error) => alert(error.response?.data?.message || 'Ocorreu um erro ao buscar os vendedores.'))
    },
})
