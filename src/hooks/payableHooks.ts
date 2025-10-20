import BankAccount from '../models/BankAccount'
import Payable from '../models/Payable'

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
