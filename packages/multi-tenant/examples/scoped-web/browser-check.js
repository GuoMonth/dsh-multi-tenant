// Run with: agent-browser --session dsh57 eval --stdin < browser-check.js
(async () => {
  const $ = id => document.getElementById(id)
  const wait = async (predicate, label) => {
    const end = Date.now() + 10000
    while (!predicate()) { if (Date.now() > end) throw new Error(`Timed out: ${label}; ${$('notice').textContent}`); await new Promise(resolve => setTimeout(resolve, 25)) }
  }
  const assert = (value, label) => { if (!value) throw new Error(label) }
  const selectIdentity = async identity => {
    $('identity').value = identity; $('login').click()
    await wait(() => $('account').textContent === identity && $('notice').textContent === 'Identity selected', `login ${identity}`)
  }
  const send = async (text, delivery = 'queue') => {
    $('message').value = text; $('delivery').value = delivery; $('notice').textContent = ''; $('composer').requestSubmit()
    await wait(() => $('notice').textContent === 'Message accepted', `send ${text}`)
  }
  const base = '/_dsh-multi-tenant/agents'
  const cases = []
  for (const identity of ['acme-alice', 'acme-bob', 'globex-alice']) {
    await selectIdentity(identity)
    const old = $('target').dataset.root; $('create').click()
    await wait(() => $('target').dataset.root && $('target').dataset.root !== old, 'create')
    const root = $('target').dataset.root
    await send(`hello ${identity}`)
    await wait(() => $('history').textContent.includes(`Demo response: hello ${identity}`), 'root response')
    await send('/hold')
    await wait(() => $('activity').textContent === 'Running', 'running')
    await send(`steer ${identity}`, 'steer')
    $('stop').click()
    await wait(() => $('activity').textContent === 'Inactive', 'cancel')
    await send('/delegate')
    await wait(() => [...$('children').querySelectorAll('button')].some(button => button.textContent === 'Demo native worker'), 'native child')
    ;[...$('children').querySelectorAll('button')].find(button => button.textContent === 'Demo native worker').click()
    await wait(() => !!$('target').dataset.child, 'child selected')
    const child = $('target').dataset.child
    assert(!$('history').textContent.includes('Current runtime context'), 'host context exposed as user history')
    await send(`hello child ${identity}`)
    await wait(() => $('history').textContent.includes(`Demo response: hello child ${identity}`), 'child response')
    await send('/hold')
    await wait(() => $('activity').textContent === 'Running', 'child running')
    await send('child steer', 'steer'); $('stop').click()
    await wait(() => $('activity').textContent === 'Inactive', 'child cancel')
    await send('/present')
    await wait(() => !!$('deliveries').querySelector('a'), 'native child delivery')
    const file = $('deliveries').querySelector('a').href
    const loaded = new Promise(resolve => $('preview').addEventListener('load', resolve, { once: true }))
    $('deliveries').querySelector('button').click(); await loaded
    assert(!window.deliveryScriptExecuted, 'delivery executed script in parent')
    assert($('preview').hasAttribute('sandbox'), 'preview is not sandboxed')
    const download = await fetch(file)
    assert(download.status === 200, 'download refused')
    assert(download.headers.get('content-disposition').includes('attachment'), 'download disposition')
    assert(download.headers.get('content-type').startsWith('text/plain'), 'HTML was not inert')
    assert((await download.text()).includes(`${identity} report`), 'wrong Principal filesystem')
    const count = [...$('history').querySelectorAll('p')].filter(p => p.textContent === `user: hello child ${identity}`).length
    $('reconnect').click()
    await wait(() => $('history').textContent.includes(`Demo response: hello child ${identity}`), 'reconnect baseline')
    assert([...$('history').querySelectorAll('p')].filter(p => p.textContent === `user: hello child ${identity}`).length === count, 'duplicate on reconnect')
    cases.push({ identity, root, child, file, checks: ['root send/steer/stop', 'native child send/steer/stop', 'native present', 'inert preview', 'download', 'observation reconnect'] })
  }
  let denied = 0
  for (const own of cases) {
    await selectIdentity(own.identity)
    const { agents } = await (await fetch(base)).json()
    assert(agents.some(agent => agent.id === own.root), 'own root missing')
    for (const other of cases.filter(item => item !== own)) {
      assert(!agents.some(agent => agent.id === other.root), 'cross-Principal listing')
      const root = `${base}/${other.root}`
      const child = `${root}/children/${other.child}`
      const requests = [
        [root, 'GET'], [`${root}/history`, 'GET'], [`${root}/events`, 'GET'], [`${root}/children`, 'GET'],
        [`${root}/messages`, 'POST', { text: 'forged' }], [`${root}/cancel`, 'POST', {}],
        [`${child}/history`, 'GET'], [`${child}/messages`, 'POST', { text: 'forged' }], [`${child}/cancel`, 'POST', {}],
        [other.file, 'GET'], [other.file, 'HEAD'], [`${base}/${own.root}/children/${other.child}/history`, 'GET'],
      ]
      for (const [url, method, body] of requests) {
        const response = await fetch(url, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) })
        assert(response.status === 404, `cross-Principal request: ${method} ${url} => ${response.status}`); denied++
      }
    }
    for (const path of ['/api', '/api/settings', '/api/plugins', '/api/openWorkspacePath']) assert((await fetch(path)).status === 404, `stock route exposed: ${path}`)
  }
  await selectIdentity(cases[0].identity)
  ;[...$('agents').querySelectorAll('button')].find(button => button.dataset.agent === cases[0].root).click()
  await wait(() => $('children').querySelector('button'), 'final root view')
  $('children').querySelector('button').click()
  await wait(() => $('deliveries').querySelector('button'), 'final delivery view')
  $('deliveries').querySelector('button').click()
  return { status: 'passed', identities: cases, rejectedCrossPrincipalRequests: denied, stockPrivilegedRoutes: '404 for all three identities', slotMode: 'authorized adapter panel; full stock UI remains deferred' }
})()
