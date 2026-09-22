# R4 OIDC and environment sessions

The `integration/cell-platform` source is bundled into the published platform CLI (`dsh-multi-tenant@0.9.0-alpha.1`) and requires OIDC. The R2 fixture cookie and `fixtureSessions` configuration were removed without migration. The fixed OIDC/Gateway combination passed finite regression; see the [current regression report](../evidence/cell-regression-2026-09-20.md) for what actually ran and its limits. The broader inventory below is a risk checklist, not a pass claim.

## Fixed topology and configuration

Use [R5 allocation configuration](r5-allocation.md) for current runtime/environment
fields. The OIDC and membership fields remain as follows (example identifiers only):

```json
{
  "oidc": {
    "issuer": "https://identity.example.net",
    "clientId": "dsh-platform",
    "clientSecretFile": "/private/oidc-client-secret",
    "platformOrigin": "https://platform.dsh.example.com",
    "siteDomain": "dsh.example.com",
    "sessionLifetimeMs": 3600000
  },
  "members": [{
    "issuer": "https://identity.example.net",
    "subject": "stable-idp-subject",
    "owner": {"tenantId": "tenant-a", "principalId": "user-a"}
  }]
}
```

Register exactly `https://platform.dsh.example.com/auth/callback` with the IdP;
use authorization code, query response mode, PKCE S256 and scope `openid`.
The secret file must be private (0600). Omit it only for a registered public
client using token endpoint authentication `none`; otherwise use
`client_secret_basic`. Issuer/subject are exact identifiers, never email,
browser-supplied owner or an unverified token claim.

Platform and every binding origin must be distinct HTTPS origins under the
configured siteDomain. The administrator must choose a domain they control
inside one registrable site, not a public suffix. Gateway terminates TLS and
preserves Host. Route platform and environment hosts exclusively through this
app; network policies must prevent direct access to Cells and the private
listener. Do not trust incoming forwarded-host headers. Reserve `/auth/*` for
the platform. Mask auth query strings and all credentials in Gateway logs.

Run `node integration/cell-platform/dist/main.js /private/configuration.json`.
Discovery must succeed within bounded network waits; there is no offline bypass.
Configuration, membership and secrets belong outside all user Cell storage.

## Authentication and revocation

`openid-client` 6.8.8 handles discovery, Code+PKCE, state, nonce, issuer/audience,
expiry and ID Token signature verification (non-repudiation checks enabled).
Network calls use HTTPS, reject redirects and have a 10-second timeout plus
request/shutdown cancellation. Access/refresh/ID tokens are neither stored as
sessions nor forwarded to DSH. There is no refresh or automatic login retry.

Login can start at the platform home page before allocation, or at an existing
environment landing page. Platform login returns to the platform without an
environment exchange. A five-minute entry record binds the
environment to a random host-only browser cookie. The platform either reuses a
live parent or performs OIDC with a separate five-minute browser-bound
transaction. It returns a 30-second, one-use ticket to the exact configured
environment. Redemption requires the original browser nonce, matching environment,
a live parent and the current owner. This is an in-process exchange, not a new
identity service or public cross-backend protocol. Concurrent login attempts in
one browser may replace the transaction cookie; restart login after rejection.

All cookies use `__Host-`, Secure, HttpOnly, Path=/ and SameSite=Lax, without
Domain. Parent lifetime is fixed (one hour default, configurable from one minute
to one hour); children expire within 30 minutes and never outlive their parent.
Timers abort active connections at expiry when the event loop runs; every new
admission also checks wall-clock expiry. There is no sliding renewal. State is
bounded and memory-only; restart requires login and does not delete Cells.

POST `/auth/logout` on either host requires its exact Origin. Environment logout
revokes its parent and all children. Platform logout revokes that browser's
parent. Other independently logged-in browsers remain active. The platform home
page provides a logout form; native DSH logout is a separate application action.

To remove/change membership, edit `members` and send SIGHUP to this process.
Only membership reloads; other settings require restart. Removal or owner change
invalidates affected parents before aborting all their connections. A failed
reload removes all membership and revokes sessions (fail closed); correct the
file and send SIGHUP again. An IdP-side logout or account change alone is not an
instant revocation feed; local TTL or membership reload bounds access. No IdP
back-channel logout, distributed state, compatibility or recovery promises.

## Regression coverage inventory

- Two real subjects map to their own environments; absent/changed membership,
  cross-owner access and direct Cell bypass fail closed.
- Wrong state/nonce/issuer/audience/signature, expired code, missing transaction,
  IdP outage and disconnect during token exchange reject without credentials in logs.
- Browser cookies across fixed HTTPS origins; copied/replayed/expired tickets,
  wrong environment or nonce, open redirects and duplicate cookie inputs reject.
- Parent/child expiry, logout and membership reload during Kubernetes admission,
  HTTP streams and WS terminate old access and reject new access; Cell tasks continue.
- Reload failure revokes all sessions; login callback racing removal cannot issue
  authority; parent expiry racing ticket redemption rejects.
- DSH cookie/bootstrap, raw native requests and platform/IdP credential filtering
  remain correct. Test login again after platform restart and concurrent tab attempts.

The inventory above is broader than this MVP acceptance. See the [current regression report](../evidence/cell-regression-2026-09-20.md) for actual real IdP/browser/CNI/TLS/session results; the complete OIDC attack matrix is not claimed.
