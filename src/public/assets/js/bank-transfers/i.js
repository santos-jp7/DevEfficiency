let __api__ = null

const app = new Vue({
    el: '#app',
    data: {
        id: null,
        accounts: [],
        sourceAccountId: null,
        destinationAccountId: null,
        amount: 0,
        date: new Date().toISOString().slice(0, 10),
    },
    methods: {
        async saveTransfer() {
            try {
                await __api__.post('/api/bank-transfers', {
                    sourceAccountId: this.sourceAccountId,
                    destinationAccountId: this.destinationAccountId,
                    amount: this.amount,
                    date: this.date,
                })
                alert('Transferência salva com sucesso!')
                window.location.href = './index.html'
            } catch (error) {
                alert('Erro ao salvar transferência')
                console.error(error)
            }
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

        this.id = params.id

        __api__ = axios.create({
            headers: {
                Authorization: [type, token].join(' '),
            },
        })

        __api__.get('/api/auth/verify').catch(() => {
            localStorage.clear()
            location.href = '/'
        })

        if (this.id) {
            __api__
                .get(`/api/bank-transfers/${params.id}`)
                .then((res) => {
                    const transfer = res.data
                    this.sourceAccountId = transfer.sourceAccountId
                    this.destinationAccountId = transfer.destinationAccountId
                    this.amount = transfer.amount
                    this.date = moment(transfer.date).format('YYYY-MM-DD')
                })
                .catch((error) => {
                    console.error(error)
                    alert('Erro ao carregar a transferência.')
                })
        }

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
