/** Optional official display slots. The host must serve the authorized panel at this same-origin path. */
import { createElement } from 'react'
export const name = 'multi-tenant-panel'
export const inject = ['slots']
export function apply(ctx, { panelPath = '/tenant-panel' } = {}) {
  if (!/^\/[a-zA-Z0-9/_-]+$/.test(panelPath)) throw new TypeError('panelPath must be a local absolute pathname')
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
    { name: 'sidebar.panellist', id: 'multi-tenant', order: 100, label: 'Tenant workspace' },
    () => createElement('span', { 'aria-hidden': true }, 'MT'),
  ))
  ctx.slots.inject('main', () => ctx.slots.register(
    { name: 'main', key: 'multi-tenant' },
    () => createElement('iframe', { src: panelPath, title: 'Tenant workspace', style: { width: '100%', height: '100%', border: 0 } }),
  ))
}
