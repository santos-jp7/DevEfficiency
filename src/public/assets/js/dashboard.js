let __api__ = null

const dashboard = new Vue({
    el: '#dashboard',
    data: {
        banners: [],
        active_banners: [],
    },
    methods: {
        handlerDelete(cod_banner) {
            if (!confirm('Confirma exclusão?')) return

            __api__
                .delete('/api/banners/' + cod_banner)
                .then(() => document.location.reload())
                .catch((error) => {
                    console.log(error)

                    alert(
                        error.response.data.message ||
                            'Ocorreu um erro. Tente novamente mais tarde.',
                    )
                })
        },
        handlerEdit(banner) {
            modal_banner.banner = banner

            $('#bannerModal').modal('toggle')
        },
        handlerAdd() {
            modal_banner.banner = {
                COD_BANNER: null,
                ARQUIVO: null,
                COD_LEILAO: null,
                COD_GRUPO: null,
                COD_LOTE: null,
                SEQ_BANNER: 1,
                DAT_INICIO: null,
                DAT_FIM: null,
                STS_BANNER: 1,
                TPO_BANNER: 1,
            }

            $('#bannerModal').modal('toggle')
        },
        handlerOrderUp(banner) {
            if (banner.SEQ_BANNER == 1)
                return alert('Este banner já é o primeiro do seu grupo.')

            banner.SEQ_BANNER--

            __api__
                .put('/api/banners/' + banner.COD_BANNER, banner)
                .then(() => window.location.reload())
                .catch((e) =>
                    console.log(
                        error.response.data.message ||
                            'Ocorreu um erro. Tente novamente mais tarde.',
                    ),
                )
        },
        handlerOrderDown(banner) {
            banner.SEQ_BANNER++

            __api__
                .put('/api/banners/' + banner.COD_BANNER, banner)
                .then(() => window.location.reload())
                .catch((e) =>
                    console.log(
                        error.response.data.message ||
                            'Ocorreu um erro. Tente novamente mais tarde.',
                    ),
                )
        },
    },
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
            .get('/api/banners/full')
            .then(({ data }) => {
                this.$data.banners = data
            })
            .catch((error) => {
                console.log(error)

                alert(
                    error.response.data.message ||
                        'Ocorreu um erro. Tente novamente mais tarde.',
                )
            })

        __api__
            .get('/api/banners')
            .then(({ data }) => {
                this.$data.active_banners = data
            })
            .catch((error) => {
                console.log(error)
                alert(
                    error.response.data.message ||
                        'Ocorreu um erro. Tente novamente mais tarde.',
                )
            })
    },
})

const modal_banner = new Vue({
    el: '#bannerModal',
    data: {
        banner: {
            COD_BANNER: null,
            ARQUIVO: null,
            COD_LEILAO: null,
            COD_GRUPO: null,
            COD_LOTE: null,
            SEQ_BANNER: 1,
            DAT_INICIO: null,
            DAT_FIM: null,
            STS_BANNER: 1,
            TPO_BANNER: 1,
        },
        leiloes: [],
    },
    methods: {
        previewFile() {
            const reader = new FileReader()
            const icone_file = document.getElementById('file').files[0]

            reader.readAsDataURL(icone_file)
            reader.onload = () => (this.$data.banner.ARQUIVO = reader.result)
        },
        handlerSubmit(event) {
            event.preventDefault()

            let method = this.$data.banner.COD_BANNER
                ? __api__.put
                : __api__.post
            let url = this.$data.banner.COD_BANNER
                ? '/api/banners/' + this.$data.banner.COD_BANNER
                : '/api/banners'

            method(url, this.$data.banner)
                .then(() => window.location.reload())
                .catch((e) =>
                    console.log(
                        error.response.data.message ||
                            'Ocorreu um erro. Tente novamente mais tarde.',
                    ),
                )
        },
    },
    mounted: async function () {
        this.$data.leiloes = (await __api__.get('/api/leiloes')).data
    },
    watch: {
        'banner.DAT_INICIO'() {
            this.$data.banner.DAT_INICIO =
                this.$data.banner.DAT_INICIO.split('T')[0] ||
                this.$data.banner.DAT_INICIO
        },
        'banner.DAT_FIM'() {
            this.$data.banner.DAT_FIM =
                this.$data.banner.DAT_FIM.split('T')[0] ||
                this.$data.banner.DAT_FIM
        },
    },
})
