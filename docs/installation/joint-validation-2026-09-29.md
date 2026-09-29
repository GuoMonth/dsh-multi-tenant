# RC2 joint reference validation — 2026-09-29

E followed D's installation documentation as a second operator on the dedicated local kind cluster. Real installation, two Dex subjects, native DSH access and retained-data lifecycle passed after two integration fixes. **G3 is not accepted:** a real model writing/reading workspace files and executing commands, and at least one genuinely authorized MCP/CLI tool chain, remain for the user's final E2E. No package, product image or release was published.

## Fixed combination

| Component | Exact identity |
| --- | --- |
| Runtime merged source | `7f762c6c3cdf6bba6970cf2f08cc7d23c580c6a2` (runtime PR106); no E runtime changes |
| Connector source | `286a68d3ae592fc1ab6193297b79f5fdc9964a3b` |
| Platform installation baseline | `47c43e93e708c191a92b3e3c97ce32cc4f5cd2ff` (C/D merged) |
| E executable/chart fixes | `9ece200c3f13329e1c91be7ffad6e274dba84924` |
| DSH | npm `0.2.0-rc.2`, source `639ed015397290b3745d163aafe02ffee4aa3f84` |
| Upstream core | v1.0.3, `registry.k8s.io/agent-sandbox/agent-sandbox-controller@sha256:b2160ee08dd4f2285b382d4b5073948891adfacbc9808a4ba9cf247766243c8c` |
| Workload | `docker.io/library/dsh-mvp-rc2@sha256:338d50f33680b8b1e10c6691596118e2273e48f084a609ea2734143c54a5feff` |
| Final platform | `docker.io/library/dsh-mvp-rc2@sha256:f9c2b6975909f4ba0f61b7c352232e9a5c553361158e710a5a7bd3bc693d3967` |
| Actual joint-flow platform | `docker.io/library/dsh-mvp-rc2@sha256:b04b47aa9ccab958801335cdd56b9a003272dde67a7dc7c53dbb6fe1f2d2346c` |
| Fixture ingress | Traefik v3.7.13, `docker.io/library/traefik@sha256:3429c14149401de2ac82fc72ddc6a92642332b90deb3012301ff211b9d2d0f18` |
| Fixture IdP | Dex v2.45.1, `ghcr.io/dexidp/dex@sha256:f5f9fb373188b0f701b80edd68b3f4745ced69306c9d382999f11b7774335a98` |
| Cluster | kind `dsh-mvp-rc2`, Kubernetes 1.37.0, Calico 3.32.2, local-path `standard`, one Linux/amd64 node |

All image identities above are Linux/amd64 manifest digests, not the local Docker multi-platform/attestation index. Product images remain local/imported into kind. Workload retains A's proven one-line settings patch; E did not change its protocol or launcher.

The final platform repack differs from the full-flow package only in `dist/oidc-CUqe0Cxg.mjs.map`, incorporating a source comment explaining the form policy. Extracted executable files are byte-identical. Final image rollout and real OIDC/native HTTP access were rechecked; unchanged lifecycle tests were not repeated for a sourcemap-only change.

| Local tarball | SHA256 / npm integrity |
| --- | --- |
| Connector `0.0.0-rc.2` | `d2d22257c69f1f87e3ca982557530a1133cb7abfa7c94cc9719f84837222224c` / `sha512-91yvF4rleoFOFcK+CCJwLDi/zeOOQPpcTr8ANb9dPsOnSgvMSUZjgxlblxlVCmQOGzkFz1jD9csTwI6fhWfLNA==` |
| Final platform `0.10.0-alpha.1` | `4235f3e4ec70c996bf91c05db6fe5c83f34a5520d6f1df039f3dea7376692ade` / `sha512-zm6pMkrxjyLEba9W3tIfdOdhPbQbk/k9XjXZbKSTXyEwPoIhf25+Fh2zvujSDmQcdV+YmuiT6kA7KdYTLT4E0g==` |
| Full-flow platform `0.10.0-alpha.1` | `5e0a1d09385503c611c0a5afa452d559b25965f230225c0bab750d61a6fd8c24` / `sha512-xMDYQ972lTjgmCUSaX//mQnZqT4UKWKoqpvWSXrL+s8udrQ6K/u9SAIRWVvyX6HbivRq9Qz+4uedKNPGsRU2Dg==` |

## Actual installation findings

The installer ran from the platform container with explicit kubeconfig/context, isolated DNS and host UID for private input access. It checked actual TLS/Secret keys, strict HTTPS Dex discovery, storage, nodes and ingress. The existing exactly pinned upstream core was reused; this is not evidence of provisioning a brand-new cluster/CNI/controller dependency stack.

The original non-root init failed with `EPERM: chmod '/private'`: fsGroup permits access but does not transfer root-directory ownership. The fix creates `/private/platform` as UID1000, mode0700, and copies the mode0600 client secret inside. The failed release was explicitly stopped/uninstalled and its control PVC retained. A fresh namespace then installed successfully with the corrected chart. Later candidate image changes were explicit integration rollouts, not a supported old-Alpha upgrade workflow.

A private issuer CA now has optional `oidc.caSecretName` and `oidc.caSecretKey`, mounted read-only through native `NODE_EXTRA_CA_CERTS`; the installer also receives the CA. There is no skip-TLS option or arbitrary environment/configuration framework. Browser fixture contexts accept the local certificate, so browser/public-PKI trust is not claimed.

Real Chromium login exposed a second defect: HTML `Referrer-Policy: no-referrer` made form POST send `Origin: null`, which correctly failed strict CSRF checks. HTML pages now use `same-origin`; redirect responses still suppress referrers. The actual form now sends the expected Origin. CSRF validation itself is unchanged.

## Observed acceptance

| Check | Actual result |
| --- | --- |
| Two identities | Real Dex login/code exchange for distinct local alice/bob subjects; each mapped to its own owner, Sandbox UID and single PVC UID |
| Native application | Both users opened RC2 UI and performed native settings/session HTTP calls and WS session-follow snapshots |
| Ownership | Alice's request to Bob's platform environment rejected403; Bob's native endpoint from Alice context rejected401 |
| Stop/start | Alice normal stop ~1102ms; wake to Ready ~4147ms; exact PVC UID retained; native session and model configuration persisted |
| Pod reconstruction | Exact running Alice Pod deleted normally; upstream core recreated a different Pod UID; same PVC, session, model config and marker file retained |
| Logout | Established native WS closed, new native HTTP rejected401; Bob's existing WS remained open |
| Membership removal | ConfigMap projected update plus SIGHUP closed Bob's existing WS and rejected new HTTP; two-user membership restored afterward |
| Resources | Actual workloads request100m/256Mi, limit1CPU/1Gi; each requests one1Gi PVC; Kubernetes-native fields verified |
| Initial readiness | Alice9237ms, Bob7185ms from first create to queried Ready, one local cached-image node; no 5-second SLA claim |
| Small access sample | Concurrency1/2/8, five batches each,55 native settings requests total, zero failures; first run p95~15/69/77ms, not model latency or capacity proof |
| Local source/artifact checks | `pnpm release:check` (metadata/types/23 tests/build/clean installed consumer) and7 installation tests passed |

Files were seeded/read through explicit administrator exec, not by a model or tool. Model settings used the native supported API without a real model request. No dummy credential or mock is counted as authorized model/tool evidence.

Missing/replaced PVC UID, concurrent writes, unknown writes, unverified stop and workload network rejection retain B's actual-cluster evidence for this unchanged exact Connector/workload combination. E did not relabel B's runs as new combined-platform tests or destroy its final users' PVCs. See runtime [B evidence](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/docs/evidence/mvp-b-runtime-2026-09-29.md) and local `evidence/b/volume-identity.json`, `final-scenarios.jsonl`, `aged-writer.json`, `network.json`.

## Boundaries and handoff

- G3 remains open for real model read/write/command execution and genuine external-tool authorization. Final user E2E decides release; no publication is authorized by these checks.
- Dex is a real fixture IdP, not evidence for arbitrary enterprise SSO. Its memory storage, local test CA and passwords are reference prerequisites, not product distribution defaults.
- Single-node local-path requested capacity is not a directory hard quota, disk-exhaustion test, shared-storage durability or cross-node recovery proof. No automatic node-partition recovery is promised. Backup/upgrade and scale remain #112/#113.
- Source fixtures and reproduction notes are in [integration/e2e](../../integration/e2e/README.md). Existing target state must be inspected, not overwritten by rerunning installation.
- The dedicated local evidence directory is `/home/aigs/projects/runtime/dsh-mvp-rc2/evidence/e/`: install/error/build logs, `browser.json`, `lifecycle.json`, `revocation.json`, performance samples and local tarballs. Credentials/cookies are only in the adjacent private directory and never in this repository.
- E retains `dsh-mvp-e-system`, `dsh-mvp-e-platform-final`, both user environments and PVCs for final E2E. The failed initial namespace retains only its control PVC/prerequisite Secrets. No other project's containers were changed.
