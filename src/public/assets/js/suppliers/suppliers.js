
let __api__ = null;

const app = new Vue({
    el: '#app',
    data: {
        suppliers: [],
    },
    mounted: function () {
        const token = localStorage.getItem('token');
        const expires_in = localStorage.getItem('expires_in');
        const type = localStorage.getItem('type');

        if (!token || !expires_in || !type) return (location.href = '/');
        if (expires_in <= new Date().valueOf()) return (location.href = '/');

        __api__ = axios.create({
            headers: {
                Authorization: [type, token].join(' '),
            },
        });

        __api__.get('/api/auth/verify').catch(() => {
            localStorage.clear();
            location.href = '/';
        });

        __api__.get('/api/suppliers')
            .then(({ data }) => {
                this.suppliers = data;
            })
            .catch((error) => {
                console.error(error);
                alert(error.response?.data?.message || 'Ocorreu um erro ao buscar os fornecedores.');
            });
    },
});
