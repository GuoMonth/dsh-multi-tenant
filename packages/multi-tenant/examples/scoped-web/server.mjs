import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { startProfile } from './profile.mjs'

const directory = process.env.DSH_MT_DEMO_DIRECTORY ? resolve(process.env.DSH_MT_DEMO_DIRECTORY) : await mkdtemp(join(tmpdir(), 'dsh-mt-demo-'))
const profile = await startProfile({ directory, port: Number(process.env.DSH_MT_DEMO_PORT ?? 0) })
console.log(JSON.stringify({ url: `${profile.origin}/tenant-panel`, directory, mode: 'loopback demo authentication; keyless model; real DSH runtime' }))
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void profile.close().then(() => process.exit(0)) })
