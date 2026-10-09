import { FastifyPluginCallback } from 'fastify'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import isMcpAuthed from '../middlewares/isMcpAuthed'
import registerTools from './tools'

// Endpoint MCP (Streamable HTTP, stateless): cada requisição cria um servidor e um transporte novos
const mcp: FastifyPluginCallback = (instance, opts, next) => {
    instance.post('/mcp', { preHandler: [isMcpAuthed] }, async (req, reply) => {
        const server = new McpServer({ name: 'devefficiency', version: '1.0.0' })
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })

        registerTools(server, instance)

        reply.hijack()
        reply.raw.on('close', () => {
            transport.close()
            server.close()
        })

        await server.connect(transport)
        await transport.handleRequest(req.raw, reply.raw, req.body)
    })

    const methodNotAllowed = async (req: any, reply: any) =>
        reply.status(405).send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null })

    instance.get('/mcp', { preHandler: [isMcpAuthed] }, methodNotAllowed)
    instance.delete('/mcp', { preHandler: [isMcpAuthed] }, methodNotAllowed)

    next()
}

export default mcp
