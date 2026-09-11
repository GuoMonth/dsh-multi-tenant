import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
const require = createRequire('/opt/probe/package.json')
const { McpServer } = await import(require.resolve('@modelcontextprotocol/sdk/server/mcp.js'))
const { StdioServerTransport } = await import(require.resolve('@modelcontextprotocol/sdk/server/stdio.js'))
const server = new McpServer({ name: 'native-host-probe', version: '1.0.0' })
server.registerTool('identity', { description: 'Read the current Principal test marker from its private filesystem.', inputSchema: {} }, async () => ({
  content: [{ type: 'text', text: await readFile('/domain/workspaces/project/identity.txt', 'utf8') }],
}))
await server.connect(new StdioServerTransport())
