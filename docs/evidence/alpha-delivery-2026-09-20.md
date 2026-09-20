# Cell alpha delivery verification — 2026-09-20

Scope: npm CLI packaging and the existing-Kubernetes entry. This supplements the [core regression](cell-regression-2026-09-20.md); it does not repeat or broaden its acceptance claims. **No npm/GHCR/GitHub release was published and no dist-tag was moved.**

## Actual checks

- `pnpm release:check`: metadata/contract, release preflight, peer policy, typecheck, 40 SDK tests, build, SQLite restart/revocation proof, installed SDK tarball smoke, 7 platform tests and installed Cell CLI smoke passed. The added source/DSH/mixed-image release-binding negative test also passed (5 script tests total).
- Packed `0.9.0-alpha.1` installed into an empty npm consumer with lifecycle scripts disabled. Help/version, bundled server/admin resolution, safe configuration rejection, rejection of old `--image` options and unavailable-admin failure passed. Publication guard rejects the unbound source manifest.
- Built `integration/distribution/Dockerfile` from that tarball and ran it in the existing dedicated `dsh-issue82` cluster, using the same private config/state and fixed Cell/Operator images. The installed CLI reported `0.9.0-alpha.1`; its private-socket `inspect` returned Alice's original Ready instance.
- Fresh real Dex OIDC login after switching the platform image: Alice retained Cell UID `bc5a841b-c04c-40a3-aeea-fed64d4835c3` and native DSH sessions; Bob retained the delete-requested barrier and was not recreated. Browser TLS validation remained enabled. No additional model call was needed.
- Runtime: source standards, Kustomize platform render and 7 launcher tests passed. The first launcher test attempt lacked its `tar` dependency; frozen `npm ci --ignore-scripts` resolved the environment, then all tests passed. No runtime controller code changed.
- The runtime manifest generator was exercised with synthetic digest inputs and the real fixed source: it resolves the exact DSH baseline and refuses an existing output. This is parser/metadata verification, **not public-image acceptance**.
- Screenshots were recaptured from the original real-model session, visually checked, and copied unchanged into both repositories. No credentials or authentication URLs appear.

## Artifact identity and limits

Exact tarball/image hashes are in [the machine-readable record](alpha-delivery-2026-09-20.json). The final tarball includes the completed README/docs metadata. Its CLI, platform, admin executable bytes and Cell combination manifest are byte-identical to the tarball run in the cluster. The final tarball separately passed clean-consumer checks.

Public runtime images, runtime prerelease manifest, npm publication and a clean installation from that public npm version remain release work. The manual workflows were reviewed, not dispatched. Image-binding negative cases are local tests; no claim is made that a public combination already exists. Current `cell-release.json` deliberately uses `source-candidate` and null public images.

The runtime existing-cluster manifest path is independent of historical standalone/macOS/archive release gates. The current delivery creates no kind cluster and adds no HA, upgrade or recovery guarantee. Core OIDC/Cell behavior, Socket-vs-cluster distinctions and remaining external-Secret limitations remain exactly as stated in the original report.
