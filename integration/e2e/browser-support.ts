import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { chromium, type Browser, type Page, type Response } from 'playwright'
import { z } from 'zod'
import { refSchema } from '../../packages/multi-tenant/src/environment-contract.ts'
import { isRecord, parseJson, readJson, requiredEnv } from '../../scripts/json.ts'

declare global {
  interface Window {
    eSocket?: WebSocket
    eSocketClosed?: boolean
    revocationSocketClosed?: boolean
    modelFrames?: unknown[]
  }
}

function hasChromium(module: unknown): module is { chromium: typeof chromium } {
  return isRecord(module) && isRecord(module.chromium) && typeof module.chromium.launch === 'function'
}

export async function launchBrowser(): Promise<Browser> {
  let browserType = chromium
  const override = process.env.PLAYWRIGHT_MODULE
  if (override) {
    const filename = createRequire(import.meta.url).resolve(override)
    const module: unknown = await import(pathToFileURL(filename).href)
    const playwright = hasChromium(module) ? module : isRecord(module) ? module.default : undefined
    assert.ok(hasChromium(playwright), 'Playwright override must export Chromium')
    browserType = playwright.chromium
  }
  const address = requiredEnv('E_NODE_ADDRESS')
  const host = 'dsh-environment.test'
  return browserType.launch({
    headless: true, args: [`--host-resolver-rules=MAP *.${host} ${address}, MAP ${host} ${address}`, '--no-proxy-server'],
  })
}

const text = z.string()
const instance = z.looseObject({
  state: text, ref: refSchema,
})
export const platformResult = z.looseObject({ id: text.optional(), instance: instance.optional() })
const browserRecord = z.looseObject({ name: text, origin: text, id: text, instance, coldReadyMs: z.number(), nativeHttp: z.boolean() })
export type BrowserRecord = z.infer<typeof browserRecord>

export function readBrowserRecords(path: string): BrowserRecord[] {
  return z.object({ users: z.array(browserRecord) }).parse(readJson(path)).users
}

export async function rpc(page: Page, method: string, args: Record<string, unknown>, prefix = 'e'): Promise<unknown> {
  const reply = await page.evaluate(async ({ method, args, prefix }) => {
    const response = await fetch('/api/' + method, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ type: 'client-request', rpcId: `${prefix}-${Date.now()}`, method, payload: { args } }),
    })
    return { status: response.status, ok: response.ok, body: await response.text() }
  }, { method, args, prefix })
  const parsed = z.object({ result: z.object({ ok: z.boolean(), value: z.unknown() }) }).safeParse(parseJson(reply.body))
  if (!reply.ok || !parsed.success || !parsed.data.result.ok) throw new Error(`${method} failed: HTTP ${reply.status}`)
  return parsed.data.result.value
}

export async function submitPlatformForm(page: Page, path: string, name: string, timeout = 30_000): Promise<Response> {
  const origin = new URL(page.url()).origin
  const [response] = await Promise.all([
    page.waitForResponse(candidate => candidate.request().method() === 'POST' && candidate.url() === origin + path, { timeout }),
    page.getByRole('button', { name, exact: true }).click(),
  ])
  return response
}

export async function waitNative(page: Page): Promise<void> {
  await page.waitForTimeout(800)
  for (let step = 0; step < 6; step++) {
    if (await page.getByRole('button', {
      name: 'Continue', exact: true,
    }).count()) {
      await page.getByRole('button', {
        name: 'Continue', exact: true,
      }).first().click()
      await page.waitForTimeout(600)
      continue
    }
    if (await page.getByRole('button', {
      name: 'Add API Key', exact: true,
    }).count()) {
      await page.getByRole('button', {
        name: 'Add API Key', exact: true,
      }).click()
      await page.waitForTimeout(600)
      if (await page.getByRole('button', {
        name: 'Configure later', exact: true,
      }).count()) {
        await page.getByRole('button', {
          name: 'Configure later', exact: true,
        }).click()
        await page.waitForTimeout(600)
        continue
      }
    }
    break
  }
  await page.getByRole('button', {
    name: 'Account menu', exact: true,
  }).waitFor({
    timeout: 30000,
  })
}
