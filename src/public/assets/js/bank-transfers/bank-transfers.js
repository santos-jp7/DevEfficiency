let __api__ = null

const app = new Vue({
    el: '#app',
    data: {
        transfers: [],
        accounts: [],
    },
    methods: {
        getAccountName(accountId) {
            const transfer = this.transfers.find(t => t.id === accountId)
            if (transfer) {
                if (transfer.SourceAccount && transfer.SourceAccount.id === accountId) {
                    return transfer.SourceAccount.name
                }
                if (transfer.DestinationAccount && transfer.DestinationAccount.id === accountId) {
                    return transfer.DestinationAccount.name
                }
            }
            return ''
        },
        async cancelTransfer(transfer) {
            const reason = prompt(`Cancelar a transferência de ${this.formatCurrency(transfer.amount)}? O valor volta para a conta de origem.\n\nMotivo (obrigatório):`)
            if (!reason) return

            try {
                await __api__.post(`/api/bank-transfers/${transfer.id}/cancel`, { reason })
                const { data } = await __api__.get('/api/bank-transfers')
                this.transfers = data
            } catch (error) {
                alert(error.response?.data?.message || 'Não foi possível cancelar a transferência.')
            }
        },
        formatDate(date) {
            return moment(date).format('DD/MM/YYYY')
        },
        formatCurrency(value) {
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
            .get('/api/bank-transfers')
            .then(({ data }) => {
                this.transfers = data
            })
            .catch((error) => {
                console.error(error)
                alert(error.response?.data?.message || 'Ocorreu um erro ao buscar as transferências.')
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
