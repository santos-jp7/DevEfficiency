import checksWorker from './workers/checksWorker'
import subscriptionsWorker from './workers/subscriptionsWorker'
import payablesWorker from './workers/payablesWorker'

export default function () {
    checksWorker.setup()
    subscriptionsWorker.setup()
    payablesWorker.setup()
}
