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
export E_PLATFORM_IMAGE=docker.io/library/dsh-mvp-rc2@sha256:f9c2b6975909f4ba0f61b7c352232e9a5c553361158e710a5a7bd3bc693d3967
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
