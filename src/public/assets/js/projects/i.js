let __api__ = null

const project = new Vue({
    el: '#project',
    data: {
        id: 0,
        name: null,
        fixed: false,
        url: null,
        type: null,
        ClientId: 0,
        ServerId: null,
        Client: {
            name: null,
        },
        Subprojects: [],
        Service_orders: [],
        Checks: [],
        payloads: {
            service_order: {
                subject: null,
                description: null,
            },
            subproject: {
                id: null,
                name: null,
                url: null,
                type: null,
            },
            check: {
                id: null,
                description: null,
                url: null,
                condition: null,
                verify_status: true,
                send_alert: null,
                path_return: null,
                message: null,
            },
        },
        references: {
            servers: [],
        },
    },
    methods: {
        handlerSubmit(e) {
            e.preventDefault()

            __api__
                .put('/api/projects/' + this.$data.id, {
                    name: this.$data.name,
                    url: this.$data.url,
                    type: this.$data.type,
                    ServerId: this.$data.ServerId,
                })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerPinProject() {
            __api__
                .put('/api/projects/' + this.$data.id, {
                    fixed: !this.$data.fixed,
                })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerNewOs() {
            $('#newOsModal').modal('toggle')
        },
        handlerNewOsSubmit(e) {
            e.preventDefault()

            __api__
                .post('/api/os', {
                    subject: this.$data.payloads.service_order.subject,
                    description: this.$data.payloads.service_order.description,
                    ProjectId: this.$data.id,
                })
                .then(({ data }) => {
                    window.location.href = '/service_orders/i?id=' + data.id
                })
                .catch((e) =>
                    console.log(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.'),
                )
        },
        handlerNewSubproject() {
            this.$data.payloads.subproject = {
                id: null,
                name: null,
                url: null,
                type: null,
            }

            $('#subprojectModal').modal('toggle')
        },
        handlerEditSubproject(subprojectId) {
            this.$data.payloads.subproject = this.Subprojects.find((v) => v.id == subprojectId)

            $('#subprojectModal').modal('toggle')
        },
        handlerDeleteSubproject(subprojectId) {
            if (!confirm('Confirma exclusão?')) return

            __api__.delete('/api/subprojects/' + subprojectId)
            window.location.reload()
        },
        handlerSubprojectSubmit(e) {
            e.preventDefault()

            let method = this.$data.payloads.subproject.id ? __api__.put : __api__.post
            let url = this.$data.payloads.subproject.id
                ? '/api/subprojects/' + this.$data.payloads.subproject.id
                : '/api/subprojects'

            method(url, {
                name: this.$data.payloads.subproject.name,
                url: this.$data.payloads.subproject.url,
                type: this.$data.payloads.subproject.type,
                ProjectId: this.$data.id,
            })
                .then(() => {
                    window.location.reload()
                })
                .catch((e) => {
                    alert(e.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
                    window.location.reload()
                })
        },
        handlerNewCheck() {
            this.$data.payloads.check = {
                id: null,
                description: null,
                url: null,
                condition: null,
                verify_status: true,
                send_alert: null,
                path_return: null,
                message: null,
            }

            $('#checkModal').modal('toggle')
        },
        handlerEditCheck(checkId) {
            this.$data.payloads.check = this.Checks.find((v) => v.id == checkId)

            $('#checkModal').modal('toggle')
        },
        handlerDeleteCheck(checkId) {
            if (!confirm('Confirma exclusão?')) return

            __api__.delete('/api/checks/' + checkId)
            window.location.reload()
        },
        handlerCheckSubmit(e) {
            e.preventDefault()

            let method = this.$data.payloads.check.id ? __api__.put : __api__.post
            let url = this.$data.payloads.check.id ? '/api/checks/' + this.$data.payloads.check.id : '/api/checks'

            method(url, {
                description: this.$data.payloads.check.description,
                url: this.$data.payloads.check.url,
                condition: this.$data.payloads.check.condition,
                verify_status: this.$data.payloads.check.verify_status,
                send_alert: this.$data.payloads.check.send_alert,
                path_return: this.$data.payloads.check.path_return,
                message: this.$data.payloads.check.message,
                ProjectId: this.$data.id,
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
            .get('/api/projects/' + params.id)
            .then(({ data }) => {
                Object.keys(data).forEach((key) => (this.$data[key] = data[key]))
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })

        __api__
            .get('/api/servers')
            .then(({ data }) => {
                if (!data) return

                this.$data.references.servers = data
            })
            .catch((error) => {
                console.log(error)

                alert(error.response.data.message || 'Ocorreu um erro. Tente novamente mais tarde.')
            })
    },
})
