# DSH multi-tenant

[简体中文](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/README.zh-CN.md)

Self-hosted, multi-user [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) on Kubernetes. Members sign in with OpenID Connect (OIDC) and use the native DSH interface in their own persistent AI work environment.

**Release candidate:** Linux/amd64, one node and one platform replica, for trusted organization members and fresh installations. The RC combination is platform **0.10.0-rc.1**, runtime **0.4.0-rc.1**, DSH **0.2.0-rc.2**.

## Install

Use an existing Kubernetes cluster with network policy enforcement, dynamic storage, HTTPS ingress and an OIDC provider. The installation machine needs Node 24+, Helm 3 and kubectl.

```sh
npm install --global dsh-multi-tenant@0.10.0-rc.1
```

Follow the [installation guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/installation.md) to prepare configuration and run preflight/install. Images come from the [matching release manifest](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.10.0-rc.1). For an AI assistant, use [AI.md](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/AI.md).

## Use

Open the platform URL and sign in. Choose **Enter / create**, then **Inspect / resolve status**. When Ready, choose **Open environment** and configure your model and tools inside DSH.

Each user has one persistent volume for files, conversations, configuration and tool credentials. Normal stop/start and Pod recreation retain it. **Stop** interrupts the whole environment; logout or member removal revokes access and retains data. See [operations](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/operations.md) for restart, deletion and troubleshooting.

## Documentation

- [English guides](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/index.md) · [中文指南](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/index.md)
- [Architecture](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/architecture.md) · [Contributing](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONTRIBUTING.md)
- [Runtime repository](https://github.com/GuoMonth/dsh-isolated-runtime): workload image, resource identity and lifecycle. Its Connector is bundled into this platform; deployment starts here.
- [Releases and validation](https://github.com/GuoMonth/dsh-multi-tenant/releases)

MIT licensed.
