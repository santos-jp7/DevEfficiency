let __api__ = null

const app = new Vue({
    el: '#app',
    data: {
        accounts: [],
    },
    methods: {
        formatCurrency(value) {
            // if (typeof value !== 'number') {
            //     return 'R$ 0,00';
            // }
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
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

        __api__.get('/api/auth/verify').catch(() => {
            localStorage.clear()
            location.href = '/'
        })

        __api__
            .get('/api/bank-accounts')
            .then(({ data }) => {
                this.accounts = data
            })
            .catch((error) => {
                console.error(error)
                alert(error.response?.data?.message || 'Ocorreu um erro ao buscar as contas.')
            })
    },
})
