import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

if (process.env.PROBE_PID_FILE) writeFileSync(process.env.PROBE_PID_FILE, String(process.pid))

const server = createServer((_request, response) => response.end(process.env.DSH_DOMAIN_ID))
const mode = process.env.PROBE_MODE
if (mode === 'stubborn-tree') {
  process.on('SIGTERM', () => {})
  spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)'], { stdio: 'ignore' })
}
server.listen(0, '127.0.0.1', () => {
  if (mode === 'never-ready') return
  process.send({
    type: 'runtime-ready', domainId: process.env.DSH_DOMAIN_ID,
    generation: Number(process.env.DSH_RUNTIME_GENERATION),
    version: mode === 'wrong-version' ? 'wrong' : process.env.DSH_RUNTIME_VERSION,
    endpoint: `http://127.0.0.1:${server.address().port}`,
  })
})
