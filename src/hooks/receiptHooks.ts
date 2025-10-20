import BankAccount from '../models/BankAccount'
import Receipt from '../models/Receipts'

// This function reverts the balance change for a given receipt
const revertReceiptTransaction = async (receipt: Receipt, transaction: any) => {
    if (receipt.BankAccountId) {
        const bankAccount = await BankAccount.findByPk(receipt.BankAccountId, { transaction })
        if (bankAccount) {
            bankAccount.balance = Number(bankAccount.balance) - Number(receipt.value)
            await bankAccount.save({ transaction })
        }
    }
}

// This function applies the balance change for a given receipt
const applyReceiptTransaction = async (receipt: Receipt, transaction: any) => {
    if (receipt.BankAccountId) {
        const bankAccount = await BankAccount.findByPk(receipt.BankAccountId, { transaction })
        if (bankAccount) {
            bankAccount.balance = Number(bankAccount.balance) + Number(receipt.value)
            await bankAccount.save({ transaction })
        }
    }
}

const receiptHooks = {
    async afterCreate(receipt: Receipt, options: any) {
        await applyReceiptTransaction(receipt, options.transaction)
    },

    async afterUpdate(receipt: Receipt, options: any) {
        const previousReceipt = new Receipt({
            value: receipt.previous('value') || 0,
            BankAccountId: receipt.previous('BankAccountId'),
            createdAt: receipt.previous('createdAt'),
            updatedAt: receipt.previous('updatedAt'),
            method: receipt.previous('method') || 'Boleto',
            note: receipt.previous('note') || '',
        })
        await revertReceiptTransaction(previousReceipt, options.transaction)

        // Apply the new transaction
        await applyReceiptTransaction(receipt, options.transaction)
    },

    async afterDestroy(receipt: Receipt, options: any) {
        await revertReceiptTransaction(receipt, options.transaction)
    },
}

export default receiptHooks
