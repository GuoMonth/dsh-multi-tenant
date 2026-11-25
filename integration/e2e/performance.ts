import * as fs from 'node:fs'
import assert from 'node:assert/strict'
import { parseJson, requiredEnv } from '../../scripts/json.ts'
import { launchBrowser, platformResult } from './browser-support.ts'
import { readUsers } from './fixture.ts'

const root = requiredEnv('E_PRIVATE'), evidence = requiredEnv('E_EVIDENCE'), base = 'https://dsh-environment.test'
async function main(): Promise<void> {
  const [user] = readUsers(root)
  assert.ok(user, 'Missing browser performance fixture user')
  const browser = await launchBrowser()
  try {
    const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        proxy: { server: 'http://127.0.0.1:9', bypass: 'dsh-environment.test,*.dsh-environment.test' },
      }), page = await context.newPage()
    await page.goto(base + '/auth/login')
    if (await page.getByText('Log in with Email').count())
      await page.getByText('Log in with Email').click()
    await page.locator('input[name="login"]').fill(user.email)
    await page.locator('input[name="password"]').fill(user.password)
    await page.locator('button[type="submit"]').click()
    await page.getByRole('heading', {
      name: 'Your environments',
    }).waitFor()
    await page.getByRole('link', {
      name: 'Inspect / resolve status', exact: true,
    }).click()
    assert.equal(platformResult.parse(parseJson(await page.locator('body').innerText())).instance?.state, 'Ready')
    await page.goto(base)
    await page.getByRole('link', {
      name: 'Open environment', exact: true,
    }).click()
    await page.getByRole('button', {
      name: 'Account menu', exact: true,
    }).waitFor()
    const measurements = []
    for (const concurrency of [1, 2, 8]) {
      const sample = await page.evaluate(async (concurrency) => {
        const times: number[] = []
        let failures = 0
        const start = performance.now()
        for (let batch = 0; batch < 5; batch++)
          await Promise.all(Array.from({
            length: concurrency,
          }, async (_, n) => {
            const t = performance.now()
            const r = await fetch('/api/settings/describe', {
              method: 'POST', signal: AbortSignal.timeout(30_000), headers: {
                'content-type': 'application/json',
              }, body: JSON.stringify({
                type: 'client-request', rpcId: `perf-${batch}-${n}`, method: 'settings/describe', payload: {
                  args: {},
                },
              }),
            })
            const body: unknown = await r.json()
            if (!r.ok || !body || typeof body !== 'object' || !('result' in body) ||
                !body.result || typeof body.result !== 'object' || !('ok' in body.result) || body.result.ok !== true)
              failures++
            times.push(performance.now() - t)
          }))
        times.sort((a, b) => a - b)
        return {
          concurrency,
          requests: times.length,
          failures,
          totalMs: performance.now() - start,
          medianMs: times[Math.floor(times.length / 2)],
          p95Ms: times[Math.ceil(times.length * .95) - 1],
        }
      }, concurrency)
      assert.equal(sample.failures, 0)
      measurements.push(sample)
    }
    const result = {
      scope: 'one real authenticated browser, settings/describe, five batches per concurrency; not capacity or model performance', measurements,
    }
    fs.writeFileSync(evidence + '/performance.json', JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result))
  }
  finally {
    await browser.close()
  }
}

await main()
