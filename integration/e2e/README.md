# Local RC2 joint acceptance

These are explicit, destructive test-environment operations, not a second installer or product service. Run only as the dedicated cluster owner. They use actual Dex, Traefik, the installed platform and native DSH. The fixture IdP does not prove enterprise SSO compatibility. No script invokes a real model or authorizes an external tool.

The recorded operator was separate from the installation author. Start with [the installation guide](../../docs/installation/README.zh-CN.md); the fixture helpers only supply its required DNS/TLS/IdP/Ingress prerequisites. See [the actual result and fixed identities](../../docs/installation/joint-validation-2026-09-29.md).

Prerequisites are the dedicated `kind-dsh-mvp-rc2` cluster/container, an imported pinned platform/workload image and the pinned Dex/Traefik images from the result table. Node 24, Helm, kubectl, Docker and Playwright 1.58.2 are required. If installing its browser, use `PLAYWRIGHT_SKIP_BROWSER_GC=1`. Do not use floating product tags as acceptance identities.

Set private directories outside the repository (mode 0700): `E_PRIVATE`, `E_EVIDENCE`, and explicit `KUBECONFIG`. Private input consists of `ca.crt`, `tls.crt`, `tls.key`, `client-secret` and `users.json`; the latter holds two generated local identities `{name,email,password,hash,userID}`, with names alice/bob, IDs e-alice/e-bob and bcrypt password hashes. The local certificate covers `dsh-mvp-rc2.test`, `*.env.dsh-mvp-rc2.test` and `idp.dsh-mvp-rc2.test`. Keep every credential file mode 0600. `E_EVIDENCE/images.json` contains the `platform`, `dex`, `traefik` sha256 manifest digests from the result table. Do not rerun credential generation over an existing installation.

```sh
node integration/e2e/reference-infra.mjs
# Wait for actual dex/traefik rollouts in dsh-mvp-e-system.
E_NAMESPACE=dsh-mvp-e-platform-final node integration/e2e/prepare-install.mjs
# prepare-install writes only private values/kubeconfig, test Secrets, and the
# one local issuer DNS entry in this dedicated cluster. It saves original DNS once.
export E_NAMESPACE=dsh-mvp-e-platform-final E_NODE_ADDRESS=192.168.64.2
export E_PLATFORM_IMAGE=docker.io/library/dsh-mvp-rc2@sha256:51a70c4aadf107813b37c51b3a6dd6a760c2a275a3f56c52d672671c959736f2
bash integration/e2e/install-reference.sh preflight
bash integration/e2e/install-reference.sh install
# PLAYWRIGHT_MODULE may point to an isolated installed playwright module.
node integration/e2e/browser.cjs
node integration/e2e/lifecycle.cjs
node integration/e2e/revocation.cjs
node integration/e2e/performance.cjs
```

The wrapper uses the invoking UID to read private host files and per-container DNS, without changing host DNS/trust. The product remains UID1000. Set the actual kind node address when it differs. The host must access that bridge address. Browser contexts accept the local test certificate; installer and platform OIDC use strict Node TLS with the provided CA. This is not browser/public-PKI validation.

Run these stages in order once: lifecycle logs out Alice; revocation invalidates Bob and restores membership; performance logs Alice in again. State files contain session cookies and stay private. Native sessions and the administrator-written marker file persist; administrator exec is explicitly not model/tool proof. Lifecycle deletes only Alice's exact current Pod to exercise core reconstruction; it retains PVCs. Revocation temporarily removes Bob from this platform ConfigMap, waits for projection, sends SIGHUP, then restores membership. A failed restoration must be inspected before handing the environment to the user.

Scripts do not erase data or tear down the cluster. Retain the two user environments for final human E2E. Missing/replaced PVC and unknown-stop evidence is reused from the unchanged exact runtime B package and explicitly identified in the joint result, not relabeled as a new E run.

## Real model and authorized CLI

`model-tool.cjs` uses Alice's `E_PRIVATE/release-alice-browser.json` after an actual OIDC login, the native model credential store and a GitHub CLI installed in her persistent HOME. Set the model key through the native `credentials/set` API from a private local file; never place it in source, command arguments or evidence. Import an explicitly authorized GitHub credential through `gh auth login --with-token` stdin; use only the two read-only user/repository API calls in the prompt. Do not copy platform or Kubernetes credentials.

The probe asks actual DeepSeek to write/read `release-model-proof.txt`, calculate its hash, and invoke the authenticated CLI. It waits for a completed native session turn and saves a redacted summary under `E_EVIDENCE`; raw native frames stay in `E_PRIVATE`. Then stop/start and recreate the exact fixture Pod to verify that file, native session, model credential and CLI authorization remain usable. Check the other user's HOME lacks that CLI credential. Remove temporary test authorization after acceptance, without removing other user data.
