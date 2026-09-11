/** Keyless provider over the real DSH model/Agent protocol. */
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

export class TestModel extends LlmAdapter {
  readonly entered = Promise.withResolvers<void>()
  before?: (options: GenerateOptions) => Promise<void>
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.entered.resolve()
    await this.before?.(options)
    options.signal?.throwIfAborted()
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'test response' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'test response' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
