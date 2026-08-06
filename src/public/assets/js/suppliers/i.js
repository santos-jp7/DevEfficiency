
let __api__ = null;

const app = new Vue({
    el: '#app',
    data: {
        id: null,
        isInternational: false,
        cnpjLookupLoading: false,
        name: '',
        cnpj: '',
        email: '',
        phone: '',
    },
    methods: {
        async lookupCnpj() {
            const raw = (this.cnpj || '').replace(/\D/g, '')
            if (raw.length !== 14) return alert('Informe um CNPJ com 14 dígitos antes de buscar.')
            this.cnpjLookupLoading = true
            try {
                const { data } = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${raw}`)
                this.name = data.razao_social || this.name
                this.email = data.email || this.email
                if (data.ddd_telefone_1) {
                    this.phone = data.ddd_telefone_1.replace(/\D/g, '')
                }
            } catch (e) {
                alert('CNPJ não encontrado. Preencha os dados manualmente.')
            } finally {
                this.cnpjLookupLoading = false
            }
        },
        maskCnpj() {
            if (!this.cnpj) return
            const raw = this.cnpj.replace(/\D/g, '').slice(0, 14)
            this.cnpj = raw.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
        },
        async saveSupplier() {
            const isEditing = !!this.id;
            const url = isEditing ? `/api/suppliers/${this.id}` : '/api/suppliers';
            const method = isEditing ? 'put' : 'post';

            const payload = {
                name: this.name,
                cnpj: this.cnpj,
                email: this.email,
                phone: this.phone,
            };

            try {
                await __api__[method](url, payload);
                alert("Fornecedor salvo com sucesso!");
                location.href = './index.html';
            } catch (error) {
                console.error(error);
                alert(error.response?.data?.message || 'Erro ao salvar o fornecedor.');
            }
        },
        async deleteSupplier() {
            if (!confirm("Tem certeza que deseja excluir este fornecedor?")) {
                return;
            }
            try {
                await __api__.delete(`/api/suppliers/${this.id}`);
                alert("Fornecedor excluído com sucesso!");
                location.href = './index.html';
            } catch (error) {
                console.error(error);
                alert(error.response?.data?.message || 'Erro ao excluir o fornecedor.');
            }
        },
        async fetchSupplierData() {
            try {
                const { data } = await __api__.get(`/api/suppliers/${this.id}`);
                this.name = data.name;
                this.cnpj = data.cnpj;
                this.email = data.email;
                this.phone = data.phone;
            } catch (error) {
                console.error(error);
                alert("Erro ao carregar os dados do fornecedor.");
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
            this.fetchSupplierData();
        }
    },
});
