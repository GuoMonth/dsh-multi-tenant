import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { fileURLToPath, pathToFileURL } from 'node:url'

const demoDirectory = fileURLToPath(new URL('.', import.meta.url))
const demoUrl = `${pathToFileURL(demoDirectory).href}/`
const ctx = new Context()

ctx.baseUrl = demoUrl
await ctx.plugin(Loader, { baseUrl: demoUrl })
await ctx.plugin(Include, { path: './cordis.yml', initial: [] })
const fixture = await import('./fixture.ts')
await ctx.loader.await()

// The fixture starts once the included tree activates. Await its completion so
// this executable is deterministic for the integration test.
await fixture.completed
await ctx.fiber.dispose()
