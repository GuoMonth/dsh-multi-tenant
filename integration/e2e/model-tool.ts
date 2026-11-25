// Requires a real model key set through native credentials API and authorized gh in the user HOME.
import * as fs from 'node:fs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requiredEnv } from '../../scripts/json.ts'
import { launchBrowser, readBrowserRecords, rpc } from './browser-support.ts'

const root = requiredEnv('E_PRIVATE'), evidence = requiredEnv('E_EVIDENCE')
const turnEnd = z.object({ value: z.object({ event: z.object({
  type: z.literal('turn/end'), data: z.object({ reason: z.object({ kind: z.string() }) }),
}) }) })

async function main(): Promise<void> {
  const alice = readBrowserRecords(evidence + '/browser.json').find(user => user.name === 'alice')
  assert.ok(alice, 'Missing Alice browser fixture')
  const browser = await launchBrowser()
  try {
    const context = await browser.newContext({
        ignoreHTTPSErrors: true, storageState: root + '/release-alice-browser.json',
        proxy: { server: 'http://127.0.0.1:9', bypass: 'dsh-environment.test,*.dsh-environment.test' },
      }), page = await context.newPage()
    await page.goto(alice.origin)
    await page.getByRole('button', {
      name: 'Account menu', exact: true,
    }).waitFor()
    const { sessionId } = z.object({ sessionId: z.string() })
      .parse(await rpc(page, 'session/create', { request: {} }, 'release'))
    await rpc(page, 'session/selectModel', {
      request: {
        sessionId, provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'low',
      },
    }, 'release')
    fs.writeFileSync(root + '/release-session.json', JSON.stringify({
      sessionId,
    }), {
      mode: 0o600,
    })
    await page.evaluate((sessionId) => {
      const frames: unknown[] = []
      window.modelFrames = frames
      const socket = new WebSocket('wss://' + location.host + '/api/remote.mux')
      socket.onopen = () => { socket.send(JSON.stringify({
        type: 'open', streamId: 'release', endpoint: 'session/follow', payload: {
          args: {
            request: {
              address: {
                kind: 'session', sessionId,
              },
            },
          },
        },
      })) }
      socket.onmessage = (event) => {
        const data: unknown = event.data
        if (typeof data === 'string') frames.push(JSON.parse(data))
      }
    }, sessionId)
    await rpc(page, 'session/prompt', {
      request: {
        sessionId, requestId: randomUUID(), mode: 'queue', content: [{
          type: 'text', text: 'Perform this release verification using your actual tools. In the current workspace write release-model-proof.txt containing exactly RC2-MODEL-PERSISTENCE-OK, read it back, and run a shell command that computes its SHA256. Then run gh api user --jq .login and gh api repos/GuoMonth/dsh-multi-tenant --jq .full_name with the already configured GitHub CLI. Only these read-only GitHub API calls are authorized; do not change GitHub data. Never read or print credential files, environment variables or tokens. Report the file content, hash, account and repo returned. All local file/command actions here are approved.',
        }],
      },
    }, 'release')
    console.log(JSON.stringify({
      sessionId, promptAccepted: true,
    }))
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(2000)
      const frames = z.array(z.unknown()).parse(await page.evaluate(() => window.modelFrames))
      fs.writeFileSync(root + '/release-model-frames.json', JSON.stringify(frames), {
        mode: 0o600,
      })
      const end = frames.map(frame => turnEnd.safeParse(frame)).find(result => result.success)
      if (end) {
        if (end.data.value.event.data.reason.kind !== 'completed')
          throw Error('Model turn did not complete')
        const text = JSON.stringify(frames)
        for (const expected of ['RC2-MODEL-PERSISTENCE-OK', '9735a294015a92e507dd93943dabe2322a96ab3939e327966f9a35410d36d9f2', 'GuoMonth/dsh-multi-tenant'])
          if (!text.includes(expected))
            throw Error('Missing expected model result')
        fs.writeFileSync(evidence + '/model-tool.json', JSON.stringify({
          sessionId, model: 'deepseek-flash', completed: true, file: 'release-model-proof.txt', sha256: '9735a294015a92e507dd93943dabe2322a96ab3939e327966f9a35410d36d9f2', externalTool: 'GitHub CLI authenticated read-only user and repository API', frames: frames.length,
        }, null, 2))
        console.log('Verified model file read/write, shell and authenticated GitHub CLI')
        return
      }
      if (i === 119)
        throw Error('Model completion timeout')
    }
  }
  finally {
    await browser.close()
  }
}

await main()
