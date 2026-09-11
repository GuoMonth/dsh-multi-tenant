const $ = id => document.getElementById(id)
const base = '/_dsh-multi-tenant/agents'
let root, child, stream, generation = 0, view = new AbortController(), attempt
const history = new Map()
const notice = message => { $('notice').textContent = message }
const run = operation => { void operation().catch(error => { if (error.name !== 'AbortError') notice(error.message) }) }
async function request(url, method = 'GET', body, signal = view.signal) {
  const response = await fetch(url, { method, signal, credentials: 'same-origin', ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) })
  if (!response.ok) throw new Error(`Request refused (${response.status})`)
  return response.status === 204 ? undefined : response.json()
}
function reset() {
  generation++; stream?.close(); stream = undefined; view.abort(); view = new AbortController()
  history.clear(); attempt = undefined
  for (const id of ['history', 'transient', 'children', 'deliveries']) $(id).replaceChildren()
  $('preview').removeAttribute('src'); $('activity').textContent = 'Inactive'
}
function targetPath() {
  if (!root) throw new Error('Select an Agent first')
  return `${base}/${encodeURIComponent(root)}${child ? `/children/${encodeURIComponent(child)}` : ''}`
}
function button(label, action) {
  const element = document.createElement('button'); element.textContent = label; element.type = 'button'; element.onclick = () => run(action); return element
}
async function list() {
  const opened = generation
  const result = await request(base)
  if (opened !== generation) return
  $('agents').replaceChildren(...result.agents.map(agent => {
    const li = document.createElement('li')
    const control = button(agent.id, async () => choose(agent.id))
    control.dataset.agent = agent.id; li.append(control); return li
  }))
}
function choose(id, childRef) {
  reset(); root = id; child = childRef
  $('target').textContent = child ?? root
  $('target').dataset.root = root
  $('target').dataset.child = child ?? ''
  const opened = generation
  stream = new EventSource(`${targetPath()}/events`)
  const update = frame => {
    if (opened !== generation) return
    if (frame.type === 'replace' || frame.type === 'append') {
      if (frame.type === 'replace') history.clear()
      for (const item of frame.page.items) history.set(item.seq, item)
      $('history').replaceChildren(...[...history.values()].sort((a, b) => a.seq - b.seq).filter(item => item.text !== undefined).map(item => {
        const p = document.createElement('p'); p.textContent = `${item.kind}: ${item.text}`; return p
      }))
      $('activity').textContent = frame.page.active ? 'Running' : 'Inactive'
      $('transient').textContent = ''
      $('children').replaceChildren(...(child ? [button('Back to root', async () => choose(root))] : []), ...(frame.page.children ?? []).map(item => button(item.label ?? item.mode, async () => choose(root, item.ref))))
      const path = targetPath()
      $('deliveries').replaceChildren(...(frame.page.deliveries ?? []).map(file => {
        const row = document.createElement('div'); const name = document.createElement('span'); name.textContent = `${file.name} `
        const url = `${path}/deliveries/${encodeURIComponent(file.ref)}`
        const download = document.createElement('a'); download.textContent = 'Download'; download.href = `${url}?download=1`; download.dataset.ref = file.ref
        row.append(name, button('Preview', async () => { $('preview').src = url }), document.createTextNode(' '), download); return row
      }))
    } else if (frame.type === 'status') {
      $('activity').textContent = frame.active ? 'Running' : 'Inactive'
      if (!frame.active) $('transient').textContent = ''
    } else if (frame.type === 'transient') {
      if (frame.reset || attempt !== frame.attempt) $('transient').textContent = ''
      attempt = frame.attempt; $('transient').textContent += frame.text
    }
  }
  for (const type of ['replace', 'append', 'status', 'transient']) stream.addEventListener(type, event => update(JSON.parse(event.data)))
  stream.onerror = () => { if (opened === generation) { stream.close(); $('transient').textContent = ''; $('activity').textContent = 'Disconnected'; notice('Observation closed. Reconnect to establish a new baseline.') } }
}
$('login').onclick = () => run(async () => {
  reset(); root = child = undefined; $('agents').replaceChildren(); $('target').textContent = 'Select an Agent'; $('target').removeAttribute('data-root'); $('target').removeAttribute('data-child'); $('account').textContent = 'Not signed in'
  const identity = $('identity').value
  await request('/demo/login', 'POST', { identity }); $('account').textContent = identity; await list(); notice('Identity selected')
})
$('create').onclick = () => run(async () => { const { agent } = await request(base, 'POST', { profile: 'demo' }); await list(); choose(agent.id); notice('Agent created') })
$('refresh').onclick = () => run(list)
$('reconnect').onclick = () => run(async () => { if (!root) throw new Error('Select an Agent first'); choose(root, child); notice('Observation reopened') })
$('remove').onclick = () => run(async () => { if (!root) throw new Error('Select an Agent first'); await request(`${base}/${root}`, 'DELETE'); reset(); root = child = undefined; $('target').textContent = 'Select an Agent'; await list(); notice('Root deleted') })
$('composer').onsubmit = event => { event.preventDefault(); run(async () => {
  await request(`${targetPath()}/messages`, 'POST', { text: $('message').value, delivery: $('delivery').value }); $('message').value = ''; notice('Message accepted')
}) }
$('stop').onclick = () => run(async () => { await request(`${targetPath()}/cancel`, 'POST', {}); notice('Stop accepted') })
window.addEventListener('pagehide', () => { stream?.close(); view.abort() })
