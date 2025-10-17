const app = new Vue({
    el: '#protocol',
    data: {
        protocol: {},
        id: null
    },
    mounted() {
        const urlParams = new URLSearchParams(window.location.search);
        this.id = urlParams.get('id');
        if (this.id) {
            axios.get(`/api/protocols/${this.id}`, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                }
            }).then(res => {
                this.protocol = res.data;
            })
        }
    },
    methods: {
        updateProtocol() {
            axios.put(`/api/protocols/${this.id}`, { status: this.protocol.status }, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`
                }
            }).then(res => {
                alert('Protocolo atualizado com sucesso!');
                window.location.reload();
            }).catch(err => {
                alert('Erro ao atualizar protocolo.');
                console.error(err);
            })
        },
        formatCurrency(value) {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
        },
        formatDate(date) {
            return moment(date).format('DD/MM/YYYY');
        }
    }
});