import Supplier from '../models/Supplier'

export class CommissionInputError extends Error {}

const COMMISSION_FIELDS = ['billing_mode', 'CommissionSupplierId', 'commission_percent', 'commission_value'] as const
const blank = (v: any) => v === undefined || v === null || v === ''

type CommissionFields = {
    billing_mode?: 'Direto' | 'Comissão'
    CommissionSupplierId?: number | null
    commission_percent?: number | null
    commission_value?: number | null
    commission_manual?: boolean
}

// Campos de cobrança por comissão vindos do corpo da requisição (protocolo ou oportunidade). Só mexe no que foi enviado:
//  - commission_value preenchido = valor informado na mão (trava); vazio = volta a sugerir pela %;
//  - fornecedor sem % informada herda a % padrão do fornecedor.
export async function parseCommissionInput(
    body: any,
    current?: { CommissionSupplierId?: number | null; commission_percent?: number | null } | null,
): Promise<CommissionFields> {
    const sent = COMMISSION_FIELDS.filter((f) => body && f in body)
    if (sent.length === 0) return {}

    const patch: CommissionFields = {}

    if ('billing_mode' in body) {
        if (!['Direto', 'Comissão'].includes(body.billing_mode)) throw new CommissionInputError('Modo de cobrança inválido.')
        patch.billing_mode = body.billing_mode
    }

    if ('CommissionSupplierId' in body) {
        const supplierId = blank(body.CommissionSupplierId) ? null : Number(body.CommissionSupplierId)
        if (supplierId && !(await Supplier.findByPk(supplierId))) throw new CommissionInputError('Fornecedor não encontrado.')
        patch.CommissionSupplierId = supplierId
    }

    if ('commission_percent' in body) {
        const percent = blank(body.commission_percent) ? null : Number(body.commission_percent)
        if (percent !== null && !(percent >= 0 && percent <= 100)) throw new CommissionInputError('Percentual de comissão inválido.')
        patch.commission_percent = percent
    }

    const supplierId = patch.CommissionSupplierId ?? current?.CommissionSupplierId
    const percentNow = 'commission_percent' in patch ? patch.commission_percent : current?.commission_percent
    if (supplierId && percentNow == null) {
        const supplier = await Supplier.findByPk(supplierId)
        if (supplier?.default_commission_percent != null) patch.commission_percent = supplier.default_commission_percent
    }

    if ('commission_value' in body) {
        if (blank(body.commission_value)) {
            patch.commission_manual = false
        } else {
            const value = Number(body.commission_value)
            if (!(value >= 0)) throw new CommissionInputError('Valor de comissão inválido.')
            patch.commission_value = value
            patch.commission_manual = true
        }
    }

    return patch
}
