
let __api__ = null;

const app = new Vue({
    el: '#app',
    data: {
        id: null,
        name: '',
        bank: '',
        agency: '',
        accountNumber: '',
        balance: 0.0,
    },
    methods: {
        async saveAccount() {
            const isEditing = !!this.id;
            const url = isEditing ? `/api/bank-accounts/${this.id}` : '/api/bank-accounts';
            const method = isEditing ? 'put' : 'post';

            const payload = {
                name: this.name,
                bank: this.bank,
                agency: this.agency,
                accountNumber: this.accountNumber,
            };

            if (!isEditing) {
                payload.balance = this.balance;
            }

            try {
                await __api__[method](url, payload);
                alert("Conta bancária salva com sucesso!");
                location.href = './index.html';
            } catch (error) {
                console.error(error);
                alert(error.response?.data?.message || 'Erro ao salvar a conta bancária.');
            }
        },
        async deleteAccount() {
            if (!confirm("Tem certeza que deseja excluir esta conta? Esta ação não pode ser desfeita.")) {
                return;
            }
            try {
                await __api__.delete(`/api/bank-accounts/${this.id}`);
                alert("Conta excluída com sucesso!");
                location.href = './index.html';
            } catch (error) {
                console.error(error);
                alert(error.response?.data?.message || 'Erro ao excluir a conta.');
            }
        },
        async fetchAccountData() {
            try {
                const { data } = await __api__.get(`/api/bank-accounts/${this.id}`);
                this.name = data.name;
                this.bank = data.bank;
                this.agency = data.agency;
                this.accountNumber = data.accountNumber;
                // Balance is not editable
            } catch (error) {
                console.error(error);
                alert("Erro ao carregar os dados da conta.");
                location.href = './index.html';
            }
        },
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

        const urlParams = new URLSearchParams(window.location.search);
        this.id = urlParams.get('id');

        if (this.id) {
            this.fetchAccountData();
        }
    },
});
