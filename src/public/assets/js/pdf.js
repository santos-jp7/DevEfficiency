// Os PDFs exigem autenticação. O navegador não envia o header Authorization ao abrir um link, então pedimos
// (autenticado) um link temporário assinado e o abrimos. Uso: PdfLink.open({ kind: 'billing', id: 12 }).
window.PdfLink = {
    async open(params) {
        try {
            const http = axios.create({ headers: { Authorization: [localStorage.getItem('type'), localStorage.getItem('token')].join(' ') } })
            const { data } = await http.get('/api/pdf-link', { params })

            const link = document.createElement('a')
            link.href = data.url
            link.target = '_blank'
            link.rel = 'noopener'
            document.body.appendChild(link)
            link.click()
            link.remove()
        } catch (error) {
            alert((error.response && error.response.data && error.response.data.message) || 'Não foi possível gerar o documento.')
        }
    },
}
