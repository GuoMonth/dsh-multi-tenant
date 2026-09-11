import { randomBytes, createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { DomainOwner } from '../domain/repository.ts'

export interface AuthenticatedSession {
  readonly owner: DomainOwner
  readonly signal: AbortSignal
}

/** A deployment implements this after authenticating its own user/session protocol. */
export interface DomainAuthenticator {
  authenticate(request: IncomingMessage, signal: AbortSignal): Promise<AuthenticatedSession | undefined>
}

interface SessionEntry extends AuthenticatedSession { readonly timer: ReturnType<typeof setTimeout>; readonly abort: AbortController }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

/** Revocable reference adapter. Tokens are minted only through this server-side API.
 * Authentication UI/IdP integration belongs to the deploying application.
 */
export class MemoryDomainSessions implements DomainAuthenticator {
  private readonly entries = new Map<string, SessionEntry>()
  constructor(readonly cookieName = '__Host-dsh-domain') {
    if (!/^[A-Za-z0-9_-]+$/.test(cookieName)) throw new TypeError('Invalid session cookie name')
  }

  issue(owner: DomainOwner, lifetimeMs = 3_600_000): string {
    if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs <= 0 || lifetimeMs > 2_147_483_647) throw new TypeError('Invalid session lifetime')
    if (!owner.tenantId.trim() || !owner.principalId.trim()) throw new TypeError('Invalid domain owner')
    const token = randomBytes(32).toString('base64url')
    const abort = new AbortController()
    const timer = setTimeout(() => this.revoke(token), lifetimeMs)
    timer.unref()
    this.entries.set(hash(token), { owner: Object.freeze({ ...owner }), signal: abort.signal, timer, abort })
    return token
  }

  async authenticate(request: IncomingMessage, signal: AbortSignal): Promise<AuthenticatedSession | undefined> {
    signal.throwIfAborted()
    const values = (request.headers.cookie ?? '').split(';').map(value => value.trim())
      .filter(value => value.startsWith(`${this.cookieName}=`)).map(value => value.slice(this.cookieName.length + 1))
    if (values.length !== 1) return undefined
    const entry = this.entries.get(hash(values[0]!))
    return entry && !entry.signal.aborted ? entry : undefined
  }

  revoke(token: string): void {
    const key = hash(token)
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    clearTimeout(entry.timer)
    entry.abort.abort(new Error('Authentication session revoked'))
  }

  close(): void {
    for (const entry of this.entries.values()) {
      clearTimeout(entry.timer)
      entry.abort.abort(new Error('Authentication service closed'))
    }
    this.entries.clear()
  }
}
