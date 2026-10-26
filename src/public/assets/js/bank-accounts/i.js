
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
        iban: '',
        swiftCode: '',
        bankAddress: '',
        check: null,
        ledger: [],
        ledgerLoaded: false,
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
                iban: this.iban,
                swiftCode: this.swiftCode,
                bankAddress: this.bankAddress,
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
        brl: (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0),
        async loadCheck() {
            try {
                this.check = (await __api__.get(`/api/bank-accounts/${this.id}/balance-check`)).data;
                this.ledgerLoaded = false;
            } catch (error) {
                console.error(error);
            }
        },
        async loadLedger(event) {
            if (!event.target.open || this.ledgerLoaded) return;
            this.ledger = (await __api__.get(`/api/bank-accounts/${this.id}/ledger`)).data;
            this.ledgerLoaded = true;
        },
        async postCheck(path, body, okMessage) {
            try {
                await __api__.post(`/api/bank-accounts/${this.id}/${path}`, body);
                alert(okMessage);
                await this.fetchAccountData();
                await this.loadCheck();
            } catch (error) {
                alert(error.response?.data?.message || 'Não foi possível concluir a operação.');
            }
        },
        acceptCurrent() {
            if (!confirm(`Confirma que o saldo atual (${this.brl(this.check.balance)}) está correto? O saldo inicial passa a ser ${this.brl(this.check.implied_opening)}.`)) return;
            this.postCheck('opening-balance', { accept_current: true }, 'Saldo inicial definido.');
        },
        setOpening() {
            const value = prompt('Saldo inicial da conta (antes das movimentações do sistema), em R$:', this.check.opening_balance ?? this.check.implied_opening);
            if (value === null) return;
            const body = { opening_balance: Number(String(value).replace(',', '.')) };
            if (this.check.opening_balance !== null) {
                const reason = prompt('Motivo da alteração do saldo inicial:');
                if (!reason) return;
                body.reason = reason;
            }
            this.postCheck('opening-balance', body, 'Saldo inicial atualizado.');
        },
        fixBalance() {
            const reason = prompt(`Corrigir o saldo de ${this.brl(this.check.balance)} para ${this.brl(this.check.expected)}.\n\nMotivo (obrigatório, fica registrado):`);
            if (!reason) return;
            this.postCheck('fix-balance', { reason }, 'Saldo corrigido.');
        },
        async fetchAccountData() {
            try {
                const { data } = await __api__.get(`/api/bank-accounts/${this.id}`);
                this.name = data.name;
                this.bank = data.bank;
                this.agency = data.agency;
                this.accountNumber = data.accountNumber;
                this.iban = data.iban;
                this.swiftCode = data.swiftCode;
                this.bankAddress = data.bankAddress;
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
            this.loadCheck();
        }
    },
});
