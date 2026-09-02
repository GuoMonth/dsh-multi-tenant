import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer(
  { name: 'dsh-multi-tenant-v04-fixture', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.registerTool('identity', {
  description: 'Return process-local identity and secret markers.',
  inputSchema: {},
}, async () => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      tenant: process.env.TENANT_ID ?? null,
      principal: process.env.PRINCIPAL_ID ?? null,
      credentialAccepted: process.env.API_TOKEN === `token:${process.env.TENANT_ID}/${process.env.PRINCIPAL_ID}`,
    }),
  }],
}))

server.registerTool('echo', {
  description: 'Echo one value through MCP.',
  inputSchema: { value: z.string() },
}, async ({ value }) => ({ content: [{ type: 'text', text: value }] }))

await server.connect(new StdioServerTransport())
