// Actual Dex + platform + native RC probe. No model or external-tool call is asserted.
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import type { Page } from 'playwright'
import { parseJson, requiredEnv } from '../../scripts/json.ts'
import { readUsers } from './fixture.ts'
import { launchBrowser, platformResult, submitPlatformForm, waitNative, type BrowserRecord } from './browser-support.ts'

const root = requiredEnv('E_PRIVATE'), evidence = requiredEnv('E_EVIDENCE')
const users = readUsers(root)
const base = 'https://dsh-environment.test'
let activePage: Page | undefined
let phase = 'launch'
const failures: { status: number; location: string }[] = []
async function main(): Promise<void> {
  const browser = await launchBrowser()
  const result = {
    fixtureIdP: 'Dex v2.45.1', model: 'not tested: credentials unavailable', externalTool: 'not tested: authorization unavailable', users: new Array<BrowserRecord>(),
  }
  try {
    for (const user of users) {
      const context = await browser.newContext({
          ignoreHTTPSErrors: true, locale: 'en-US',
          proxy: { server: 'http://127.0.0.1:9', bypass: 'dsh-environment.test,*.dsh-environment.test' },
        }), page = await context.newPage()
      activePage = page
      phase = 'oidc-login'
      page.on('response', (response) => {
        if (response.status() < 400) return
        const url = new URL(response.url())
        failures.push({ status: response.status(), location: url.origin + url.pathname })
        if (failures.length > 20) failures.shift()
      })
      page.on('request', (r) => {
        if (r.method() === 'POST' && new URL(r.url()).host === 'dsh-environment.test')
          console.log(JSON.stringify({
            postPath: new URL(r.url()).pathname, origin: r.headers().origin, fetchSite: r.headers()['sec-fetch-site'],
          }))
      })
      await page.goto(base + '/auth/login')
      if (await page.getByText('Log in with Email').count())
        await page.getByText('Log in with Email').click()
      await page.locator('input[name="login"]').fill(user.email)
      await page.locator('input[name="password"]').fill(user.password)
      await page.locator('button[type="submit"]').click()
      await page.getByRole('heading', {
        name: 'Your environments',
      }).waitFor()
      phase = 'environment-create'
      const action = await page.locator('form[action^="/api/environments/"]').first().getAttribute('action')
      assert.ok(action, 'Missing environment action')
      const started = Date.now()
      const invoke = async (method: 'GET' | 'POST') => {
        const response = method === 'GET'
          ? await page.goto(base + action)
          : await submitPlatformForm(page, action, 'Enter / create')
        assert.ok(response, 'Missing platform navigation response')
        return {
          status: response.status(), body: platformResult.parse(parseJson(await response.text())),
        }
      }
      let response = await invoke('POST')
      assert.ok([200, 202].includes(response.status), JSON.stringify(response))
      for (let i = 0; i < 90 && response.body.instance?.state !== 'Ready'; i++) {
        await page.waitForTimeout(1000)
        response = await invoke('GET')
      }
      assert.ok(response.body.instance?.state === 'Ready' && response.body.id, 'Environment did not become Ready')
      const coldReadyMs = Date.now() - started
      await page.goto(base)
      await page.getByRole('link', {
        name: 'Open environment', exact: true,
      }).click()
      phase = 'native-ui'
      await waitNative(page)
      const record: BrowserRecord = {
        name: user.name, id: response.body.id, instance: response.body.instance, coldReadyMs,
        nativeHttp: true, origin: new URL(page.url()).origin,
      }
      await context.storageState({
        path: root + '/' + user.name + '-browser.json',
      })
      fs.chmodSync(root + '/' + user.name + '-browser.json', 0o600)
      result.users.push(record)
      fs.writeFileSync(evidence + '/browser.json', JSON.stringify(result, null, 2))
      console.log(JSON.stringify({
        user: user.name, oidc: true, environment: record.id, nativeHttp: true, coldReadyMs: record.coldReadyMs,
      }))
      await context.close()
      activePage = undefined
    }
  }
  catch (error) {
    // Private child log only; qualify-release screens fixture secrets before publication.
    if (activePage && !activePage.isClosed()) {
      const url = new URL(activePage.url())
      console.error(JSON.stringify({ phase, location: url.origin + url.pathname, failures,
        body: (await activePage.locator('body').innerText({ timeout: 3000 }).catch(() => 'Unavailable')).slice(0, 5000) }))
    }
    throw error
  }
  finally {
    await browser.close()
  }
}

await main()
