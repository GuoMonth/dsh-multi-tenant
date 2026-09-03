#!/usr/bin/env node
/** Retire prerelease npm channels superseded by the current stable release. */

const PACKAGE_NAME = 'dsh-multi-tenant'
const REGISTRY = 'https://registry.npmjs.org'
const CHANNELS = ['alpha', 'next']
const version = process.argv[2]

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[-0-9A-Za-z.]+)?$/.exec(String(value))
  if (!match) throw new Error(`invalid registry version: ${String(value)}`)
  return match.slice(1).map(Number)
}

function compareCore(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

async function readTags() {
  const response = await fetch(`${REGISTRY}/-/package/${PACKAGE_NAME}/dist-tags`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`failed to read npm dist-tags: HTTP ${response.status}`)
  return response.json()
}

if (!version || version.includes('-')) {
  throw new Error('registry channel cleanup requires a stable release version')
}

const stableCore = parseVersion(version)
const before = await readTags()
if (before.latest !== version) {
  throw new Error(`npm latest resolves to ${String(before.latest)}, expected ${version}`)
}

const removable = CHANNELS.filter(channel => {
  const target = before[channel]
  return target !== undefined && compareCore(parseVersion(target), stableCore) <= 0
})

if (removable.length === 0) {
  console.log(`registry channels already clean: latest=${version}`)
  process.exit(0)
}

const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
if (!requestUrl || !requestToken) {
  throw new Error('npm registry channel cleanup requires GitHub Actions OIDC')
}

const oidcUrl = new URL(requestUrl)
oidcUrl.searchParams.append('audience', 'npm:registry.npmjs.org')
const oidcResponse = await fetch(oidcUrl, {
  headers: {
    Accept: 'application/json',
    Authorization: `Bearer ${requestToken}`,
  },
})
if (!oidcResponse.ok) throw new Error(`failed to obtain GitHub OIDC identity: HTTP ${oidcResponse.status}`)
const { value: idToken } = await oidcResponse.json()
if (typeof idToken !== 'string' || idToken.length === 0) {
  throw new Error('GitHub OIDC response did not contain an identity token')
}

const exchangeResponse = await fetch(
  `${REGISTRY}/-/npm/v1/oidc/token/exchange/package/${PACKAGE_NAME}`,
  {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
  },
)
if (!exchangeResponse.ok) {
  throw new Error(`npm trusted-publisher token exchange failed: HTTP ${exchangeResponse.status}`)
}
const { token: registryToken } = await exchangeResponse.json()
if (typeof registryToken !== 'string' || registryToken.length === 0) {
  throw new Error('npm trusted-publisher exchange did not return a registry token')
}

for (const channel of removable) {
  const response = await fetch(
    `${REGISTRY}/-/package/${PACKAGE_NAME}/dist-tags/${encodeURIComponent(channel)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${registryToken}` },
    },
  )
  if (!response.ok) throw new Error(`failed to retire npm ${channel} dist-tag: HTTP ${response.status}`)
  console.log(`retired npm ${channel} dist-tag from ${before[channel]}`)
}

const after = await readTags()
if (after.latest !== version || removable.some(channel => channel in after)) {
  throw new Error('npm dist-tag cleanup did not converge to the expected registry state')
}
console.log(`registry channels cleaned: latest=${version}`)
