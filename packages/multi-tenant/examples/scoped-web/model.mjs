/** Keyless test adapter; real DSH Agent loops execute its native tool calls. */
import { randomUUID } from 'node:crypto'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'

export class DemoModel extends LlmAdapter {
  async *stream(options) {
    const last = options.messages.at(-1)
    const text = last?.content.filter(part => part.type === 'text').map(part => part.text).join('') ?? ''
    const human = last?.source.kind === 'user'
    const tool = human && text.includes('/delegate') ? { name: 'subagent', args: { description: 'Demo native worker', prompt: 'Please reply with a short result.', run_in_background: true } }
      : human && text.includes('/present') ? { name: 'present', args: { files: [{ path: 'report.html', description: 'Current workspace report' }] } } : undefined
    if (tool) {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId(randomUUID()), name: tool.name, arguments: JSON.stringify(tool.args) } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const response = human && text.includes('/hold') ? 'Working until you press Stop…' : `Demo response: ${human ? text : 'native operation completed'}`
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: response }
    if (human && text.includes('/hold')) await new Promise((_, reject) => {
      if (options.signal.aborted) reject(options.signal.reason)
      else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    })
    options.signal.throwIfAborted()
    yield { type: 'block-end', index: 0, block: { type: 'text', text: response } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
