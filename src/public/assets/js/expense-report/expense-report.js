
let __api__ = null;

// Recursive component for rendering the tree
Vue.component('cost-center-node', {
    template: '#cost-center-node-template',
    props: {
        node: Object,
    },
    data: function () {
        return {
            expanded: false,
        };
    },
    computed: {
        hasChildren() {
            return this.node.children && this.node.children.length > 0;
        },
    },
    methods: {
        toggle() {
            if (this.hasChildren) {
                this.expanded = !this.expanded;
            }
        },
        formatCurrency(value) {
            if (typeof value !== 'number') {
                return 'R$ 0,00';
            }
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
        },
    },
});

const app = new Vue({
    el: '#app',
    data: {
        reportData: [],
        filters: {
            startDate: '',
            endDate: '',
        },
    },
    methods: {
        async fetchReport() {
            try {
                const params = new URLSearchParams({
                    startDate: this.filters.startDate,
                    endDate: this.filters.endDate,
                });
                const { data } = await __api__.get(`/api/expense-report?${params.toString()}`);
                this.reportData = data;
            } catch (error) {
                console.error(error);
                alert(error.response?.data?.message || 'Ocorreu um erro ao buscar o relatório.');
            }
        },
        setDefaultFilters() {
            const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
            const endOfMonth = moment().endOf('month').format('YYYY-MM-DD');
            this.filters.startDate = startOfMonth;
            this.filters.endDate = endOfMonth;
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

        this.setDefaultFilters();
        this.fetchReport();
    },
});
