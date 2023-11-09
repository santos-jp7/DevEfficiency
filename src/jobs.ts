import checksWorker from './workers/checksWorker'
import subscriptionsWorker from './workers/subscriptionsWorker'

export default function () {
    checksWorker.setup()
    subscriptionsWorker.setup()
}
