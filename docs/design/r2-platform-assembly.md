# R2 platform assembly

`integration/cell-platform` is the Node 24 platform source, bundled by the published `dsh-multi-tenant@0.9.0-alpha.1` CLI. The current user entry is `start --config`; the package is not a standalone Docker workbench. Its
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
is bundled into the Cell CLI, with its source pin and license. It is not a separately published npm contract.

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

## Current authentication and deployment

The R2 fixture token and fixed prebuilt configuration have been replaced by
[R4 OIDC](r4-oidc.md) and [R5 allocation](r5-allocation.md). Use those current
configuration instructions. Runtime still owns all Kubernetes binding details;
the platform stores opaque identities and authorization intent.

## Current status and regression evidence

The fixed-version core Cell path passed the finite 2026-09-20 regression. It is not a claim that every inventory item below has run, or that later runtime source changes are published. Runtime PR #93 is still unmerged and is not part of the runtime version bound by the current npm package. Actual results are in the [current regression report](../evidence/cell-regression-2026-09-20.md). The following inventory includes cases beyond the finite MVP run; consult the report before making a pass claim: auth before resource reads, cross-owner/duplicate mappings,
revocation during API reads and after HTTP/WS upgrade, shutdown while awaiting
admission, wrong origin/Host/UID, native DSH cookie bootstrap, platform cookie/header
removal, stream and raw-query fidelity, unavailable Kubernetes, exact fixture
spec/defaulting, and upstream failures whose application outcome is unknown.
Type/build success is not browser, CNI, TLS or lifecycle acceptance.
