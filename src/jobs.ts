import checksWorker from './workers/checksWorker'
import subscriptionsWorker from './workers/subscriptionsWorker'
import payablesWorker from './workers/payablesWorker'
import balanceWorker from './workers/balanceWorker'
import billingRemindersWorker from './workers/billingRemindersWorker'
import crmFollowupsWorker from './workers/crmFollowupsWorker'

export default function () {
    checksWorker.setup()
    subscriptionsWorker.setup()
    payablesWorker.setup()
    billingRemindersWorker.setup()
    balanceWorker.setup()
    crmFollowupsWorker.setup()
}
