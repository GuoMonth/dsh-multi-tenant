import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

if (process.env.FAIL_START === '1') {
  process.stderr.write('synthetic MCP startup failure\n')
  process.exit(17)
}

const server = new McpServer(
  { name: 'dsh-multi-tenant-m5-fixture', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.registerTool('who_am_i', {
  title: 'Who Am I',
  description: 'Returns the tenant/principal markers injected into this MCP process.',
  inputSchema: {},
}, async () => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      tenant: process.env.TENANT_ID ?? null,
      user: process.env.USER_ID ?? null,
      credential: process.env.API_TOKEN ?? null,
    }),
  }],
}))

server.registerTool('echo', {
  title: 'Echo',
  description: 'Echo a value through the real MCP call path.',
  inputSchema: { value: z.string() },
}, async ({ value }) => ({
  content: [{ type: 'text', text: value }],
}))

const transport = new StdioServerTransport()
await server.connect(transport)
