# Cell MVP v1 candidate setup

This is an unpublished P2 source candidate. The published platform `0.9.0-alpha.1` and runtime `0.3.0-alpha.1` still require calibrated `allocation.profiles[]`; their release instructions remain in the [published quickstart](quickstart.md). npm `@latest` still selects the published package and does not accept this candidate schema. Candidate runtime and Connector source is `ed914317e98a93752e8af4f7831c384fc1e92f13`, and the vendor tarball is SHA-256 `e9aaa0a364cd6277ea7038025e5ffb8a8613c4eebdbe0c424c56721d162ace10`.

The candidate uses one platform-owned template, `cell-mvp-v1`. Each environment must name that same template. The allocation supplies the runtime image digest, storage size and optional StorageClass/retention policy, CPU/memory requests and limits, tenant-to-namespace map, domain, and optional same-namespace credentials Secret. Runtime validates and renders the Kubernetes resources. The platform does not accept Pod overrides, `securityClass`, `profiles`, `expectedSpec`, or `expectedPodSpec`.

Start from [`config.candidate.example.json`](../../integration/distribution/config.candidate.example.json). Its `allocation.image: null` is an explicit unbound marker, not a usable placeholder: startup rejects it. Replace it only with the exact Cell image digest built from the matching runtime source. Do not substitute the public `0.3.0-alpha.1` image. The package manifest intentionally keeps local Cell/Operator image digests null; they are supplied from the deployment administrator's local candidate build and are not published identities.

Provide the existing Kubernetes API, platform-mode Operator, Gateway/TLS, enforcing CNI, storage, namespace/RBAC mapping, DNS and OIDC prerequisites described in the [published quickstart](quickstart.md). DSH remains exactly `0.1.5-rc.2`; outbound-network policy remains an administrator responsibility.

## Render and apply the matching runtime candidate

Use the runtime checkout at the exact source commit above, with the local Cell and Operator image digests produced from that checkout. From that checkout:

```sh
test "$(git rev-parse HEAD)" = ed914317e98a93752e8af4f7831c384fc1e92f13
mkdir -m 0700 -p /private/candidate
kubectl kustomize config/platform > /private/candidate/operator.yaml
```

Edit the rendered file before applying it: set the manager image to the exact local Operator digest and change `--base-domain=cells.example.com` to the administered domain. Review the full rendered manifest and apply it explicitly:

```sh
rg -n 'image:|--base-domain=' /private/candidate/operator.yaml
kubectl apply --server-side -f /private/candidate/operator.yaml
kubectl -n dsh-system rollout status deployment/cell-operator --timeout=120s
```

Set `allocation.image` in the private platform config to the exact Cell digest from the same runtime build. The sample's null value must not be passed to startup.

## Install and start the platform tarball

Build and pack the reviewed platform source, then install the tarball in a clean consumer directory without workspace links:

```sh
pnpm --filter dsh-multi-tenant build
mkdir -m 0700 -p /private/candidate /private/candidate-consumer
pnpm --filter dsh-multi-tenant pack --pack-destination /private/candidate
cd /private/candidate-consumer
npm init -y
npm install /private/candidate/dsh-multi-tenant-0.10.0-alpha.1.tgz
./node_modules/.bin/dsh-multi-tenant start --config /private/config.json
```

The example config uses the in-cluster Kubernetes endpoint and ServiceAccount file paths. A host process must replace those values with a reachable Kubernetes API endpoint and readable CA/token files. For a Pod deployment, build the included distribution image from this same tarball in a temporary context:

```sh
mkdir -m 0700 -p /private/candidate-image
cp /private/candidate/dsh-multi-tenant-0.10.0-alpha.1.tgz integration/distribution/Dockerfile /private/candidate-image/
docker build -f /private/candidate-image/Dockerfile -t dsh-platform:candidate /private/candidate-image
```

Mount the private config, state, admin socket directory, and OIDC client secret at the configured paths and provide the matching Kubernetes ServiceAccount. The `start` command above is the container entrypoint behavior; it cannot use the sample's in-cluster paths when run directly on an ordinary host.

Use the local candidate tarball only; do not substitute npm `@latest`. Startup rejects null or missing image identity. This candidate has not been published, and these steps are instructions rather than a deployment or end-to-end acceptance result.

[中文](cell-mvp-v1-candidate.zh-CN.md)
