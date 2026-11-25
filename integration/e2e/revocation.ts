import * as fs from 'node:fs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { parseJson, readJson, requiredEnv, string } from '../../scripts/json.ts'
import { launchBrowser, readBrowserRecords } from './browser-support.ts'

const root = requiredEnv('E_PRIVATE'), evidence = requiredEnv('E_EVIDENCE'), namespace = 'dsh-mvp-e-platform-final'
const kubeconfig = requiredEnv('KUBECONFIG')
const k = (args: readonly string[]) => execFileSync('kubectl', ['--kubeconfig', kubeconfig, ...args], {
  encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000,
})

async function main(): Promise<void> {
  const bob = readBrowserRecords(evidence + '/browser.json').find(user => user.name === 'bob')
  const session = z.object({ users: z.array(z.object({ name: z.string(), sessionId: z.string() })) })
    .parse(readJson(evidence + '/lifecycle.json')).users.find(user => user.name === 'bob')?.sessionId
  assert.ok(bob && session, 'Missing Bob browser fixture')
  const original = z.object({ data: z.record(z.string(), z.string()) })
    .parse(parseJson(k(['get', 'configmap', 'dsh-platform-config', '-n', namespace, '-o', 'json']))).data
  fs.writeFileSync(root + '/platform-config-before.json', JSON.stringify(original), {
    mode: 0o600,
  })
  async function reload(data: Record<string, string>, count: number) {
    k(['patch', 'configmap', 'dsh-platform-config', '-n', namespace, '--type=merge', '-p', JSON.stringify({
      data,
    })])
    let ready = false
    for (let i = 0; i < 120; i++) {
      const n = k(['exec', '-n', namespace, 'deployment/dsh-platform', '-c', 'platform', '--', 'node', '-e', "console.log(JSON.parse(require('node:fs').readFileSync('/config/config.json')).members.length)"]).trim()
      if (Number(n) === count) {
        ready = true
        break
      }
      await delay(1000)
    }
    assert.ok(ready, 'projected config update timeout')
    k(['exec', '-n', namespace, 'deployment/dsh-platform', '-c', 'platform', '--', 'node', '-e', "process.kill(1,'SIGHUP')"])
  }
  const browser = await launchBrowser()
  try {
    const context = await browser.newContext({
        ignoreHTTPSErrors: true, storageState: root + '/bob-browser.json',
        proxy: { server: 'http://127.0.0.1:9', bypass: 'dsh-environment.test,*.dsh-environment.test' },
      }), page = await context.newPage()
    await page.goto(bob.origin)
    await page.getByRole('button', {
      name: 'Account menu', exact: true,
    }).waitFor()
    await page.evaluate(sessionId => new Promise<void>((resolve, reject) => {
      const s = new WebSocket('wss://' + location.host + '/api/remote.mux')
      window.revocationSocketClosed = false
      s.onclose = () => { window.revocationSocketClosed = true }
      s.onopen = () => { s.send(JSON.stringify({
        type: 'open', streamId: 'revoke', endpoint: 'session/follow', payload: {
          args: {
            request: {
              address: {
                kind: 'session', sessionId,
              },
            },
          },
        },
      })) }
      s.onmessage = (e) => {
        const data: unknown = e.data
        if (typeof data !== 'string') return
        const frame: unknown = JSON.parse(data)
        if (frame && typeof frame === 'object' && 'type' in frame && frame.type === 'item' &&
            'value' in frame && frame.value && typeof frame.value === 'object' &&
            'type' in frame.value && frame.value.type === 'snapshot') resolve()
      }
      s.onerror = reject
      setTimeout(() => { reject(Error('WS timeout')) }, 15000)
    }), session)
    const config = z.looseObject({
      members: z.array(z.looseObject({ owner: z.looseObject({ principalId: z.string() }) })),
    }).parse(parseJson(string(original['config.json'], 'platform configuration')))
    config.members = config.members.filter(m => m.owner.principalId !== 'bob')
    await reload({
      'config.json': JSON.stringify(config),
    }, 1)
    await page.waitForFunction(() => window.revocationSocketClosed)
    const response = await page.goto(bob.origin + '/api/settings/describe')
    assert.equal(response?.status(), 401)
    fs.writeFileSync(evidence + '/revocation.json', JSON.stringify({
      membershipReload: true, establishedNativeWebsocketClosed: true, newNativeHttpRejected: true, restoredForUserE2E: false,
    }, null, 2))
  }
  finally {
    try { await reload(original, 2) } finally { await browser.close() }
  }
  const result = {
    membershipReload: true, establishedNativeWebsocketClosed: true, newNativeHttpRejected: true, restoredForUserE2E: true,
  }
  fs.writeFileSync(evidence + '/revocation.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
}

await main()
