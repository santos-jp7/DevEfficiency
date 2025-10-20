import Protocol from '../models/Protocol'
import Protocol_register from '../models/Protocol_register'

class protocolRegisterHooks {
    static async afterCreate(protocol_register: Protocol_register) {
        const protocol = await Protocol.findByPk(protocol_register.ProtocolId)

        if (protocol && protocol.status != 'Em aberto') {
            await protocol.update({ status: 'Em aberto' })
        }
    }
}

export default protocolRegisterHooks
