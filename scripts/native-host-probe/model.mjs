// Keyless test adapter; all Agent, tool, preset and persistence behavior is native DSH.
import { createRequire } from 'node:module'
import { appendFileSync } from 'node:fs'
const rootRequire = createRequire(process.env.PROBE_PACKAGE_ROOT ?? '/opt/probe/package.json')
const { LlmAdapter, ToolCallId } = await import(rootRequire.resolve('@deepseek-ai/dsh-llm'))
let serial = 0
const textChunks = text => [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'finish', reason: { kind: 'stop' } },
]
function callChunks(name, args) {
  const id = ToolCallId(`probe-${++serial}`)
  const argumentsText = JSON.stringify(args)
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsText },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsText } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}
class ProbeModel extends LlmAdapter {
  async listModels() { return [{ id: 'probe', name: 'Keyless native-host probe' }] }
  async *stream(options) {
    const lastUser = options.messages.findLastIndex(message => message.role === 'user'
      && message.content.some(block => block.type === 'text' && /PROBE_|BOB_|ALICE_/.test(block.text)))
    const current = options.messages.slice(Math.max(0, lastUser))
    const prompt = current[0]?.content.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? ''
    const results = current.flatMap(message => message.content.filter(block => block.type === 'tool-result'))
    const schemas = (options.tools ?? []).map(tool => tool.name)
    appendFileSync(process.env.PROBE_AUDIT ?? '/domain/model-audit.jsonl', JSON.stringify({ principal: process.env.PROBE_PRINCIPAL, prompt, schemas }) + '\n')
    let chunks
    if (results.length) {
      const output = results.flatMap(block => block.content?.filter(item => item.type === 'text').map(item => item.text) ?? []).join('\n')
      chunks = textChunks(`PROBE_RESULT ${prompt} ${output}`)
    } else if (prompt.includes('PROBE_FORK')) {
      chunks = callChunks('probe_fork', { description: 'fork identity probe', prompt: 'PROBE_IDENTITY' })
    } else if (prompt.includes('PROBE_DELEGATE')) {
      chunks = callChunks('probe_delegate', { description: 'identity probe child', prompt: 'PROBE_IDENTITY', run_in_background: true })
    } else if (prompt.includes('PROBE_RESTRICT')) {
      chunks = callChunks('probe_restricted', { description: 'restricted probe child', prompt: 'PROBE_CHECK_FILTER', run_in_background: true })
    } else if (prompt.includes('PROBE_CHECK_FILTER')) {
      chunks = textChunks(`${schemas.includes('mcp__principal__identity') ? 'FILTER_BROKEN' : 'FILTER_OK'} ${prompt}`)
    } else if (prompt.includes('PROBE_IDENTITY') || prompt.includes('PROBE_FORCE_IDENTITY')) {
      chunks = callChunks('mcp__principal__identity', {})
    } else {
      chunks = textChunks(`PROBE_REPLY ${process.env.PROBE_PRINCIPAL} ${prompt}`)
    }
    for (const chunk of chunks) { options.signal?.throwIfAborted(); yield chunk }
  }
}
export const name = 'native-host-probe-model'
export const inject = ['llm']
export function apply(ctx) { ctx.llm.registerAdapter(['probe'], new ProbeModel()) }
