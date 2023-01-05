const login = new Vue({
    el: '#login',
    data: {
        username: null,
        password: null,
    },
    methods: {
        handlerSubmit(e) {
            e.preventDefault()

            axios
                .post('/api/auth', this.$data)
                .then(({ data }) => {
                    const { token, expires_in, type } = data

                    localStorage.setItem('token', token)
                    localStorage.setItem('expires_in', expires_in)
                    localStorage.setItem('type', type)

                    location.href = './dashboard.html'
                })
                .catch((error) => {
                    console.log(error)

                    alert(error.response.data.message)
                })
        },
    },
    mounted: function () {
        localStorage.clear()
    },
})
