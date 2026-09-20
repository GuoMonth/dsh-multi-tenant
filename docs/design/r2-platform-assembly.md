# R2 platform assembly

`integration/cell-platform` is the private Node 24 integration application. Its
Environment records identity/owner/opaque InstanceRef, not Pod lifecycle. The
platform authenticator grants an Environment and supplies a revocation signal;
the runtime module owns instance verification and native forwarding. The app
never invokes the old DomainRuntimeCoordinator/provider stop/recovery path.

Each Environment has one owner and one distinct instance. Duplicate bindings are
rejected. The ingress authenticates first, installs cancellation before awaiting
runtime.connect, then asks the single-use handle to forward HTTP or upgrade WS.
Closing the app or invalidating the parent session only aborts connections.

## Reproducible build

The runtime source commit and generated artifact digest live in
`vendor/cell-connector.json`. The `.tgz` is a generated input, not a second source
copy; changes must be made in the runtime repository and rebuilt with its
`hack/pack-cell-connector.mjs`. Its private package is not published to npm and
does not become a dependency of the existing published SDK/CLI.

From this repository:

```sh
node scripts/verify-cell-connector.mjs
npm ci --ignore-scripts --prefix integration/cell-platform
npm run typecheck --prefix integration/cell-platform
npm run build --prefix integration/cell-platform
```

The app's npm lock pins the tarball integrity as well as its build tools. On a
runtime change: commit its inputs, pack into this `vendor/`, update the source
commit/SHA-256 and npm lock, then build both sides. Never hand-edit extracted JS.

## R2 fixture configuration, not production authentication

Run `node integration/cell-platform/dist/main.js /private/configuration.json` only
in the controlled platform network described by runtime's R1 configuration.
TLS terminates at the administrator's Gateway, routing environment origins to
this app with their original Host. Do not bypass NetworkPolicy to run it from an
arbitrary laptop or expose the unauthenticated launcher port.

The JSON configuration contains:

- `host`, `port`: the task-owned listener.
- `kubernetes`: `server` (HTTPS), `caFile`, `tokenFile`; use namespace-scoped
  read-only credentials outside all Cell storage.
- `bindings`: runtime CellBinding records (`ref`, `namespace`, `name`, `origin`,
  `template`, exact defaulted `expectedSpec` and `expectedPodSpec`). Capture them
  from the administrator's pinned prebuilt fixture, not browser requests.
- `environments`: `{id, owner: {tenantId, principalId}, instance: {allocationKey,
  identity}}`. Bind every Environment to a configured runtime ref.
- `fixtureSessions`: `{environmentId, tokenFile}`. Each file must be private
  (0600), containing at least 43 URL-safe random token characters. Tokens are not
  printed or embedded in this repository.

Browser automation for R3 can set `__Host-dsh-platform-fixture` from that private
file on the environment origin, with Secure/HttpOnly/Path=/. Fixture sessions
expire after one hour or process shutdown. There is no login page, IdP, account
management or persistence in this fixture. R4 replaces this explicit test
entry with OIDC and parent/child sessions; it must not be advertised as login.

## Deferred regression

Record in Issue #82: auth before resource reads, cross-owner/duplicate mappings,
revocation during API reads and after HTTP/WS upgrade, shutdown while awaiting
admission, wrong origin/Host/UID, native DSH cookie bootstrap, platform cookie/header
removal, stream and raw-query fidelity, unavailable Kubernetes, exact fixture
spec/defaulting, and upstream failures whose application outcome is unknown.
Type/build success is not browser, CNI, TLS or lifecycle acceptance.
