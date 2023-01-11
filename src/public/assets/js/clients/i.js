let __api__ = null

const client = new Vue({
    el: '#client',
    data: {
        id: 0,
        name: null,
        Credentials: [],
        Projects: [],
        payloads: {
            project: {
                id: null,
                name: null,
                url: null,
                type: null,
            },
            credential: {
                id: null,
                host: null,
                username: null,
                password: null,
            },
        },
    },
    methods: {
        handlerSubmit(e) {
            e.preventDefault()

            let method = this.$data.id ? __api__.put : __api__.post
            let url = this.$data.id ? '/api/clients/' + this.$data.id : '/api/clients'

            method(url, { name: this.$data.name })
                .then(({ data }) => {
                    window.location.href = '/clients/i?id=' + data.id
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerNewProject() {
            $('#newProjectModal').modal('toggle')
        },
        handlerNewProjectSubmit(e) {
            e.preventDefault()

            __api__
                .post('/api/projects', {
                    name: this.$data.payloads.project.name,
                    url: this.$data.payloads.project.url,
                    type: this.$data.payloads.project.type,
                    clientId: this.$data.id,
                })
                .then(({ data }) => {
                    window.location.href = '/projects/i?id=' + data.id
                })
                .catch((e) =>
                    console.log(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.'),
                )
        },
        handlerNewCredential() {
            this.$data.payloads.credential = {
                id: null,
                host: null,
                username: null,
                password: null,
            }

            $('#credentialModal').modal('toggle')
        },
        handlerEditCredential(credentialId) {
            this.$data.payloads.credential = this.Credentials.find((v) => v.id == credentialId)

            $('#credentialModal').modal('toggle')
        },
        handlerDeleteCredential(credentialId) {
            if (!confirm('Confirma exclusão?')) return

            __api__.delete('/api/credentials/' + credentialId)
            window.location.reload()
        },
        handlerCredentialSubmit(e) {
            e.preventDefault()

            let method = this.$data.payloads.credential.id ? __api__.put : __api__.post
            let url = this.$data.payloads.credential.id
                ? '/api/credentials/' + this.$data.payloads.credential.id
                : '/api/credentials'

            method(url, {
                description: this.$data.payloads.credential.description,
                host: this.$data.payloads.credential.host,
                username: this.$data.payloads.credential.username,
                password: this.$data.payloads.credential.password,
            })
                .then(() => {
                    window.location.reload()
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
            .get('/api/clients/' + params.id)
            .then(({ data }) => {
                Object.keys(data).forEach((key) => (this.$data[key] = data[key]))
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
