// Utilidades da NFS-e compartilhadas entre a tela de NFS-e e a cobrança.
window.NfseApi = function () {
    const token = localStorage.getItem('token')
    const type = localStorage.getItem('type')
    return axios.create({ headers: { Authorization: [type, token].join(' ') } })
}

// PDF/XML exigem autenticação: baixa com o token e abre/salva o arquivo.
window.NfseFiles = {
    async open(id, kind) {
        try {
            const res = await NfseApi().get(`/api/nfse/${id}/${kind}`, { responseType: 'blob' })
            const url = URL.createObjectURL(res.data)
            if (kind === 'pdf') window.open(url, '_blank')
            else {
                const a = document.createElement('a')
                a.href = url
                a.download = `NFS-e_${id}.xml`
                a.click()
            }
            setTimeout(() => URL.revokeObjectURL(url), 60000)
        } catch (err) {
            let message = 'Não foi possível baixar o arquivo.'
            try {
                message = JSON.parse(await err.response.data.text()).message || message
            } catch (e) {}
            alert(message)
        }
    },
}

window.NfseFmt = {
    brl: (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0),
    date: (v) => (v ? moment(v).format('DD/MM/YYYY') : '—'),
    doc(v) {
        const d = String(v || '').replace(/\D/g, '')
        if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
        if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
        return v || ''
    },
    statusClass: (s) => ({ autorizada: 'bg-success', processando: 'bg-warning text-dark', rejeitada: 'bg-danger', cancelada: 'bg-secondary', substituida: 'bg-secondary' }[s] || 'bg-secondary'),
}
