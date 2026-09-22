# Cell MVP v1 candidate setup

This is an unpublished P2 source candidate. The published platform `0.9.0-alpha.1` and runtime `0.3.0-alpha.1` still require calibrated `allocation.profiles[]`; their release instructions remain in the [published quickstart](quickstart.md). npm `@latest` still selects the published package and does not accept this candidate schema.

The candidate uses one platform-owned template, `cell-mvp-v1`. Each environment must name that same template. The allocation supplies the runtime image digest, storage size and optional StorageClass/retention policy, CPU/memory requests and limits, tenant-to-namespace map, domain, and optional same-namespace credentials Secret. Runtime validates and renders the Kubernetes resources. The platform does not accept Pod overrides, `securityClass`, `profiles`, `expectedSpec`, or `expectedPodSpec`.

Start from [`config.candidate.example.json`](../../integration/distribution/config.candidate.example.json). Its `allocation.image: null` is an explicit unbound marker, not a usable placeholder: startup rejects it. Replace it only with the exact digest produced by the matching reviewed runtime candidate. Do not substitute the public `0.3.0-alpha.1` image. Use the candidate only after its Connector vendor and runtime image identities are bound in `cell-release.json` and supplied with the candidate package.

Provide the existing Kubernetes API, platform-mode Operator, Gateway/TLS, enforcing CNI, storage, namespace/RBAC mapping, DNS and OIDC prerequisites described in the [published quickstart](quickstart.md). DSH remains exactly `0.1.5-rc.2`; outbound-network policy remains an administrator responsibility. This guide records candidate behavior only; it is not a deployment or acceptance report.

[中文](cell-mvp-v1-candidate.zh-CN.md)
