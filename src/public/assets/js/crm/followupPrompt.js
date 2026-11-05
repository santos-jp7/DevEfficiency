// Pede o próximo follow-up ao mover uma oportunidade para uma etapa aberta sem nenhum follow-up pendente.
// Uso: <crm-followup-prompt ref="followup"></crm-followup-prompt>
//      const r = await this.$refs.followup.ask(oportunidade, etapa)  → null (cancelou) | {} (agora não) | { next_followup }
;(function () {
    const SUGGESTION = {
        Novo: 'Primeiro contato',
        Qualificado: 'Entender a necessidade / qualificar',
        Proposta: 'Acompanhar a proposta enviada',
        Negociação: 'Retornar sobre a negociação',
    }

    // Próximo dia útil às 9h.
    function nextBusinessDay() {
        const d = moment().add(1, 'day').hour(9).minute(0).second(0)
        while ([0, 6].includes(d.day())) d.add(1, 'day')
        return d.format('YYYY-MM-DDTHH:mm')
    }

    Vue.component('crm-followup-prompt', {
        data: () => ({ o: null, stage: '', form: { type: 'Ligação', subject: '', due_at: '' }, modal: null, resolve: null }),
        methods: {
            ask(opportunity, stage) {
                this.o = opportunity
                this.stage = stage
                this.form = { type: 'Ligação', subject: SUGGESTION[stage] || 'Próximo passo', due_at: nextBusinessDay() }
                this.modal = this.modal || new bootstrap.Modal(this.$refs.modal, { backdrop: 'static' })
                this.modal.show()
                return new Promise((resolve) => (this.resolve = resolve))
            },
            finish(value) {
                this.modal.hide()
                const resolve = this.resolve
                this.resolve = null
                resolve && resolve(value)
            },
            save() {
                if (!this.form.subject.trim() || !this.form.due_at) return
                this.finish({ next_followup: { ...this.form } })
            },
        },
        template: `
        <div class="modal fade" tabindex="-1" ref="modal">
            <div class="modal-dialog">
                <div class="modal-content" v-if="o">
                    <div class="modal-header">
                        <h6 class="modal-title">Próximo passo — {{ o.title }} ({{ stage }})</h6>
                        <button type="button" class="btn-close" @click="finish(null)"></button>
                    </div>
                    <div class="modal-body">
                        <p class="small text-muted">Esta oportunidade não tem follow-up pendente. Agende o próximo passo para ela não ficar parada.</p>
                        <div class="row g-2">
                            <div class="col-5">
                                <select class="form-select form-select-sm" v-model="form.type">
                                    <option v-for="t in Crm.ACTIVITY_TYPES" :value="t">{{ t }}</option>
                                </select>
                            </div>
                            <div class="col-7"><input type="datetime-local" class="form-control form-control-sm" v-model="form.due_at"></div>
                            <div class="col-12"><input type="text" class="form-control form-control-sm" v-model="form.subject" maxlength="160" placeholder="Assunto"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-link btn-sm me-auto" @click="finish({})">Agora não</button>
                        <button type="button" class="btn btn-secondary btn-sm" @click="finish(null)">Cancelar</button>
                        <button type="button" class="btn btn-dark btn-sm" :disabled="!form.subject.trim() || !form.due_at" @click="save">Agendar e mover</button>
                    </div>
                </div>
            </div>
        </div>`,
        computed: { Crm: () => window.Crm },
    })
})()
