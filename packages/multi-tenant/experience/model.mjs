import { createRequire } from 'node:module'
const require = createRequire('/opt/dsh/package.json')
const { LlmAdapter, ToolCallId } = await import(require.resolve('@deepseek-ai/dsh-llm'))
let serial = 0
class ExperienceModel extends LlmAdapter {
  async listModels() { return [{ id: 'demo', name: 'Demo · no API key / 演示模型' }] }
  async *stream(options) {
    const start = options.messages.findLastIndex(message => message.role === 'user' && message.content.some(block => block.type === 'text' && !block.text.startsWith('Current runtime context.')))
    const messages = options.messages.slice(Math.max(0, start))
    const prompt = messages[0]?.content.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? ''
    const results = messages.flatMap(message => message.content.filter(block => block.type === 'tool-result'))
    let tool
    if (!results.length) {
      if (/delegate|subagent|委派|子代理/i.test(prompt)) tool = ['demo_delegate', { description: 'Read the private sample', prompt: 'Read my sample / 读取样例', run_in_background: false }]
      else if (/create|generate|生成|创建/i.test(prompt)) tool = ['mcp__experience__create_file', {}]
      else if (/read|sample|读取|样例/i.test(prompt)) tool = ['mcp__experience__read_sample', {}]
    }
    if (tool && options.tools?.some(item => item.name === tool[0])) {
      const id = ToolCallId(`demo-${++serial}`)
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name: tool[0], argumentsDelta: JSON.stringify(tool[1]) }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: tool[0], arguments: JSON.stringify(tool[1]) } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    } else {
      const output = results.flatMap(block => block.content?.filter(item => item.type === 'text').map(item => item.text) ?? []).join('\n')
      const text = output ? `Demo / 演示 · ${process.env.DSH_DEMO_PRINCIPAL}\n\n${output}` : 'This is a deterministic demo, not an AI model. Try: “Read my sample”, “Create a file”, or “Delegate to a subagent”.\n\n这是免密钥演示模型。试试：读取样例、生成文件、委派子代理。连接自己的模型：在原生 Settings 中配置凭据，并在会话中选择真实模型。'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    options.signal?.throwIfAborted()
  }
}
export const name = 'experience-model'
export const inject = ['llm']
export function apply(ctx) { ctx.llm.registerAdapter(['experience'], new ExperienceModel()) }
