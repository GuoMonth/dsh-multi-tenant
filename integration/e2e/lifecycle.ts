import * as fs from 'node:fs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import type { BrowserContext, Page } from 'playwright'
import { z } from 'zod'
import { toConnector } from '../../charts/kubernetes-reference.ts'
import { parseJson, requiredEnv } from '../../scripts/json.ts'
import { launchBrowser, platformResult, readBrowserRecords, rpc, submitPlatformForm, waitNative } from './browser-support.ts'

const root = requiredEnv('E_PRIVATE'), evidence = requiredEnv('E_EVIDENCE'), base = 'https://dsh-environment.test'
const kubeconfig = requiredEnv('KUBECONFIG')
const records = readBrowserRecords(evidence + '/browser.json')
const k = (args: readonly string[]) => execFileSync('kubectl', ['--kubeconfig', kubeconfig, ...args], {
  encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60_000,
})
const text = z.string()
const metadata = z.object({ name: text, uid: text })
const claim = z.object({ metadata })
const claims = z.object({ items: z.array(claim) })
const pods = z.object({ items: z.array(z.object({
  metadata,
  spec: z.object({ containers: z.array(z.object({ resources: z.unknown() })) }),
  status: z.object({ conditions: z.array(z.object({ type: text, status: text })).optional() }),
})) })
const settings = z.object({ namespaces: z.array(z.object({ ns: text, revision: z.unknown(), user: z.unknown() })) })
const session = z.object({ sessionId: text })
const sessions = z.object({ items: z.array(session) })

interface UserEvidence {
  name: string
  sessionId: string
  pvcUid: string
  oldPodUid: string
  nativeHttp: boolean
  nativeWebsocketSnapshot: boolean
  modelSettings: boolean
  fileSeed: string
  resources: unknown
  stopMs?: number
  wakeReadyMs?: number
  stopStartRetained?: boolean
  podRebuildRetained?: boolean
  rebuiltPodUid?: string
}

type IsolationCheck = 'crossOwnerControl' | 'crossOwnerNative' | 'stopClosesWebsocket' |
  'logoutClosesWebsocket' | 'logoutRejectsHttp' | 'otherUserUnaffected'

const follow = (page: Page, sessionId: string) => page.evaluate(sessionId => new Promise<boolean>((resolve, reject) => {
  const s = new WebSocket('wss://' + location.host + '/api/remote.mux')
  window.eSocket = s
  window.eSocketClosed = false
  s.onclose = () => {
    window.eSocketClosed = true
  }
  const timer = setTimeout(() => { reject(Error('snapshot timeout')) }, 15000)
  s.onopen = () => { s.send(JSON.stringify({
    type: 'open', streamId: 'e', endpoint: 'session/follow', payload: {
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
    if (frame && typeof frame === 'object' && 'streamId' in frame && frame.streamId === 'e' &&
        'type' in frame && frame.type === 'item' && 'value' in frame && frame.value &&
        typeof frame.value === 'object' && 'type' in frame.value && frame.value.type === 'snapshot') {
      clearTimeout(timer)
      resolve(true)
    }
  }
  s.onerror = () => {
    clearTimeout(timer)
    reject(Error('WS rejected'))
  }
}), sessionId)
async function main(): Promise<void> {
  const [aliceRecord, bobRecord] = records
  assert.ok(aliceRecord && bobRecord, 'Two browser fixture users are required')
  const aliceLocation = toConnector(aliceRecord.instance.ref)
  const browser = await launchBrowser()
  const negative: Partial<Record<IsolationCheck, boolean>> = {}
  const result = {
    users: new Array<UserEvidence>(), negative, model: 'not tested', externalTool: 'not tested',
  }
  const save = () => { fs.writeFileSync(evidence + '/lifecycle.json', JSON.stringify(result, null, 2)) }
  try {
    const contexts: { context: BrowserContext; page: Page }[] = []
    for (const r of records) {
      const location = toConnector(r.instance.ref)
      const context = await browser.newContext({
          ignoreHTTPSErrors: true, storageState: root + '/' + r.name + '-browser.json',
          proxy: { server: 'http://127.0.0.1:9', bypass: 'dsh-environment.test,*.dsh-environment.test' },
        }), page = await context.newPage()
      contexts.push({
        context, page,
      })
      await page.goto(r.origin)
      await waitNative(page)
      const describe = settings.parse(await rpc(page, 'settings/describe', {}))
      const model = describe.namespaces.find(namespace => namespace.ns === 'llm-deepseek')
      assert.ok(model, 'Native model settings are required')
      await rpc(page, 'settings/update', {
        ns: model.ns, patch: {
          baseURL: 'https://api.deepseek.com/anthropic',
        }, expectedRevision: model.revision,
      })
      const { sessionId } = session.parse(await rpc(page, 'session/create', { request: {} }))
      await follow(page, sessionId)
      const podList = pods.parse(parseJson(k(['get', 'pods', '-n', location.namespace, '-o', 'json']))).items
      const claimList = claims.parse(parseJson(k(['get', 'pvc', '-n', location.namespace, '-o', 'json']))).items
      const [pod] = podList
      const [dataClaim] = claimList
      assert.ok(podList.length === 1 && pod && claimList.length === 1 && dataClaim)
      assert.equal(dataClaim.metadata.uid, r.instance.ref.storageId)
      const path = '/var/lib/dsh/data/workspace/e-' + r.name + '.txt', marker = 'persistent-' + r.name
      k(['exec', '-n', location.namespace, pod.metadata.name, '--', 'node', '-e', `require('node:fs').writeFileSync(${JSON.stringify(path)},${JSON.stringify(marker)})`])
      const record = {
        name: r.name, sessionId, pvcUid: dataClaim.metadata.uid, oldPodUid: pod.metadata.uid, nativeHttp: true, nativeWebsocketSnapshot: true, modelSettings: true, fileSeed: 'administrator exec (not model/tool evidence)', resources: pod.spec.containers[0]?.resources,
      }
      result.users.push(record)
      save()
    }
    const [alice, bob] = contexts
    const [aliceEvidence] = result.users
    assert.ok(alice && bob && aliceEvidence)
    const portal = await alice.context.newPage()
    let response = await portal.goto(base + '/api/environments/' + bobRecord.id)
    assert.equal(response?.status(), 403)
    result.negative.crossOwnerControl = true
    response = await portal.goto(bobRecord.origin + '/api/settings/describe')
    assert.equal(response?.status(), 401)
    result.negative.crossOwnerNative = true
    const operation = async (path: string, name: string) => {
      await portal.goto(base)
      const start = Date.now()
      const response = await submitPlatformForm(portal, `/api/environments/${aliceRecord.id}/${path}`, name, 90_000)
      return {
        status: response.status(), body: platformResult.parse(parseJson(await response.text())), ms: Date.now() - start,
      }
    }
    const stop = await operation('stop', 'Stop')
    assert.equal(stop.status, 200, JSON.stringify(stop))
    assert.equal(stop.body.instance?.state, 'Stopped')
    await alice.page.waitForFunction(() => window.eSocketClosed)
    aliceEvidence.stopMs = stop.ms
    result.negative.stopClosesWebsocket = true
    save()
    const started = await operation('start', 'Start stopped environment')
    assert.ok([200, 202].includes(started.status), JSON.stringify(started))
    let state = started.body
    const wakeStart = Date.now()
    for (let i = 0; i < 90 && state.instance?.state !== 'Ready'; i++) {
      await portal.waitForTimeout(1000)
      await portal.goto(base + '/api/environments/' + aliceRecord.id)
      state = platformResult.parse(parseJson(await portal.locator('body').innerText()))
    }
    assert.equal(state.instance?.state, 'Ready')
    aliceEvidence.wakeReadyMs = Date.now() - wakeStart + started.ms
    await portal.goto(base)
    await portal.getByRole('link', {
      name: 'Open environment', exact: true,
    }).click()
    await waitNative(portal)
    const retained = async (page: Page) => {
      const resumed = sessions.parse(await rpc(page, 'session/list', { _request: {} }))
      assert.ok(resumed.items.some(entry => entry.sessionId === aliceEvidence.sessionId))
      const description = settings.parse(await rpc(page, 'settings/describe', {}))
      const provider = description.namespaces.find(entry => entry.ns === 'llm-deepseek')
      assert.equal(z.object({ baseURL: text }).parse(provider?.user).baseURL, 'https://api.deepseek.com/anthropic')
      const namespace = aliceLocation.namespace
      const [pod] = pods.parse(parseJson(k(['get', 'pods', '-n', namespace, '-o', 'json']))).items
      assert.ok(pod)
      assert.equal(k(['exec', '-n', namespace, pod.metadata.name, '--', 'cat', '/var/lib/dsh/data/workspace/e-alice.txt']), 'persistent-alice')
      assert.equal(claim.parse(parseJson(k(['get', 'pvc', 'data', '-n', namespace, '-o', 'json']))).metadata.uid, aliceEvidence.pvcUid)
      return pod
    }
    const before = await retained(portal)
    aliceEvidence.stopStartRetained = true
    save()
    k(['delete', 'pod', before.metadata.name, '-n', aliceLocation.namespace, '--wait=false'])
    let replacement
    for (let i = 0; i < 90; i++) {
      await portal.waitForTimeout(1000)
      replacement = pods.parse(parseJson(k(['get', 'pods', '-n', aliceLocation.namespace, '-o', 'json']))).items.find(p => p.metadata.uid !== before.metadata.uid && p.status.conditions?.some(c => c.type === 'Ready' && c.status === 'True'))
      if (replacement)
        break
    }
    assert.ok(replacement)
    await portal.reload()
    await waitNative(portal)
    await retained(portal)
    await follow(portal, aliceEvidence.sessionId)
    aliceEvidence.podRebuildRetained = true
    aliceEvidence.rebuiltPodUid = replacement.metadata.uid
    save()
    const logout = await alice.context.newPage()
    await logout.goto(base)
    await submitPlatformForm(logout, '/auth/logout', 'Log out')
    await portal.waitForFunction(() => window.eSocketClosed)
    result.negative.logoutClosesWebsocket = true
    response = await portal.goto(aliceRecord.origin + '/api/settings/describe')
    assert.equal(response?.status(), 401)
    result.negative.logoutRejectsHttp = true
    assert.equal(await bob.page.evaluate(() => window.eSocket?.readyState), 1)
    result.negative.otherUserUnaffected = true
    save()
    console.log(JSON.stringify(result))
  }
  finally {
    await browser.close()
  }
}

await main()
