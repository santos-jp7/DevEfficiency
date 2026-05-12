import moment from 'moment'
import BankAccount from '../models/BankAccount'
import Payable from '../models/Payable'

const recurrenceOffsets: Record<string, [number, moment.unitOfTime.DurationConstructor]> = {
    quinzenal: [15, 'days'],
    mensal: [1, 'months'],
    trimestral: [3, 'months'],
    semestral: [6, 'months'],
    anual: [1, 'years'],
    bianual: [2, 'years'],
    trianual: [3, 'years'],
}

const nextDueDate = (current: string, recurrence: string): string => {
    const [amount, unit] = recurrenceOffsets[recurrence]
    return moment.utc(current).add(amount, unit).format('YYYY-MM-DD')
}

// This function reverts the balance change for a given payable
const revertPayableTransaction = async (payable: Payable, transaction: any) => {
    if (payable.BankAccountId) {
        const bankAccount = await BankAccount.findByPk(payable.BankAccountId, { transaction })
        if (bankAccount) {
            bankAccount.balance = Number(bankAccount.balance) + Number(payable.value)
            await bankAccount.save({ transaction })
        }
    }
}

// This function applies the balance change for a given payable
const applyPayableTransaction = async (payable: Payable, transaction: any) => {
    if (payable.BankAccountId) {
        const bankAccount = await BankAccount.findByPk(payable.BankAccountId, { transaction })
        if (bankAccount) {
            bankAccount.balance = Number(bankAccount.balance) - Number(payable.value)
            await bankAccount.save({ transaction })
        }
    }
}

const payableHooks = {
    async afterCreate(payable: Payable, options: any) {
        if (payable.status === 'pago') {
            await applyPayableTransaction(payable, options.transaction)
        }
    },

    async afterUpdate(payable: Payable, options: any) {
        const previousStatus = payable.previous('status')
        const currentStatus = payable.status

        const changedToPaid = previousStatus !== 'pago' && currentStatus === 'pago'
        const changedFromPaid = previousStatus === 'pago' && currentStatus !== 'pago'

        if (changedToPaid) {
            await applyPayableTransaction(payable, options.transaction)

            // Generate next occurrence for recurring payables
            if (payable.recurrence) {
                const currentInstallment = payable.current_installment || null
                const totalInstallments = payable.total_installments || null

                const shouldGenerate = !totalInstallments || (currentInstallment && currentInstallment < totalInstallments)

                if (shouldGenerate) {
                    await Payable.create(
                        {
                            description: payable.description,
                            value: payable.value,
                            dueDate: nextDueDate(payable.dueDate as unknown as string, payable.recurrence),
                            status: 'pendente',
                            SupplierId: payable.SupplierId,
                            BankAccountId: payable.BankAccountId,
                            CostCenterId: payable.CostCenterId,
                            recurrence: payable.recurrence,
                            total_installments: totalInstallments,
                            current_installment: currentInstallment ? currentInstallment + 1 : null,
                            parent_payable_id: payable.parent_payable_id || payable.id,
                        },
                        { transaction: options.transaction },
                    )
                }
            }
        } else if (changedFromPaid) {
            // Create a temporary payable with previous values to revert correctly
            const previousPayable = new Payable({
                value: payable.previous('value') || 0,
                BankAccountId: payable.previous('BankAccountId'),
                createdAt: payable.previous('createdAt'),
                updatedAt: payable.previous('updatedAt'),
                description: payable.previous('description') || '',
                dueDate: payable.previous('dueDate') || new Date(),
                paymentDate: payable.previous('paymentDate'),
                status: payable.previous('status') || 'pendente',
            })
            await revertPayableTransaction(previousPayable, options.transaction)
        }
    },

    async afterDestroy(payable: Payable, options: any) {
        if (payable.status === 'pago') {
            await revertPayableTransaction(payable, options.transaction)
        }
    },
}

export default payableHooks
