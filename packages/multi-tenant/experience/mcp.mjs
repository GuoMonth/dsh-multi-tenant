// Small standards-based stdio MCP demo. No secrets or external services.
import { createInterface } from 'node:readline'
import { readFile, writeFile } from 'node:fs/promises'
const tools = [
  { name: 'read_sample', description: 'Read the current user’s private welcome sample', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'create_file', description: 'Create a sample Markdown file in the current workspace', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
]
for await (const line of createInterface({ input: process.stdin })) {
  let req
  try {
    req = JSON.parse(line)
    if (req.id === undefined) continue
    let result
    if (req.method === 'initialize') result = { protocolVersion: req.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'dsh-experience', version: '1.0.0' } }
    else if (req.method === 'ping') result = {}
    else if (req.method === 'tools/list') result = { tools }
    else if (req.method === 'tools/call') {
      let text
      if (req.params.name === 'read_sample') text = await readFile('/domain/workspace/welcome.md', 'utf8')
      else if (req.params.name === 'create_file') {
        text = `# Created for ${await readFile('/domain/.experience-owner', 'utf8')}\n\nGenerated through the native MCP tool chain.\n`
        await writeFile('/domain/workspace/demo-output.md', text)
        text = 'Created /domain/workspace/demo-output.md\n' + text
      } else throw new Error('Unknown tool')
      result = { content: [{ type: 'text', text }] }
    } else { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } }) + '\n'); continue }
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n')
  } catch {
    if (req?.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -32603, message: 'The demo tool could not complete. Check the sample file in your workspace.' } }) + '\n')
  }
}
