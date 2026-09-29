# DSH multi-tenant

[中文](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/README.zh-CN.md)

Give each authorized user a persistent AI working environment with the native DeepSeek Harness interface. Employees sign in with OIDC, enter their environment, and keep their files, conversations, tool installations and credentials across normal stop/start and Pod recreation.

**Alpha · Kubernetes · Linux/amd64 · DSH 0.2.0-rc.2 · one platform replica.** Each user has one independently owned PVC. This is intended for trusted organization members; backup, high availability and cross-node disaster recovery are outside the current guarantees.

## Install with an AI assistant

Copy this prompt to your AI assistant:

> Install DSH multi-tenant using the current release. First read https://github.com/GuoMonth/dsh-multi-tenant/blob/main/packages/multi-tenant/AI.md and follow its versioned installation guide. Check my Kubernetes context, OIDC, DNS/TLS, storage and image availability before changing the cluster. Ask for missing settings, use private files for credentials, preserve existing data, and verify two-user access and persistence after installation.

The [AI installation guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/packages/multi-tenant/AI.md) is included as `AI.md` in the npm package. It defines the installation sequence, required inputs, checks and failure handling.

## Install

Use an existing Kubernetes cluster with a NetworkPolicy-capable CNI, dynamic StorageClass and HTTPS ingress. Supply an OIDC client, platform domain and wildcard environment domain, TLS Secret and explicit member mappings. The installer requires Node 24+, Helm 3 and kubectl; it creates the fixed platform and upstream controller resources. Employees do not need individual namespace setup.

```sh
npm install --global dsh-multi-tenant@0.10.0-alpha.1
dsh-multi-tenant --version
dsh-multi-tenant preflight --values /private/values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context YOUR_CONTEXT
dsh-multi-tenant install --values /private/values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context YOUR_CONTEXT
```

Prepare the private values file with the [installation guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/installation/README.md). Use the platform and workload image digests attached to the [matching release](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.10.0-alpha.1). The npm package includes the installer and Chart. Installing npm alone does not start a server or create a cluster.

## Use

Open the platform URL and sign in. **Enter / create** allocates your environment; **Inspect / resolve status** checks it; **Open environment** enters native DSH when Ready. Configure your model and authorize your tools in DSH. **Stop** interrupts the entire environment, including running tools and background commands. **Start stopped environment** resumes access with the same data volume.

The user PVC contains `/var/lib/dsh/data/workspace` (files), `home` (user tools and configuration) and `dsh` (conversations and native credentials). CPU/memory use Kubernetes requests and limits. The requested storage capacity is not a directory hard quota on every storage backend. Logout and membership removal revoke access without deleting data.

## Two repositories, one installation

| Component | Responsibility | Entry |
| --- | --- | --- |
| **dsh-multi-tenant** | OIDC login, membership, authorization, environment bindings, HTTP/WS access, CLI and Helm installation | This repository and npm package |
| **[dsh-isolated-runtime](https://github.com/GuoMonth/dsh-isolated-runtime)** | In-process Connector, fixed workload image, namespace/PVC identity and explicit lifecycle | [Runtime contract](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/docs/design/environment-contract.zh-CN.md) |
| Upstream Agent Sandbox core | Reconciles Sandbox resources into Pods and Services | Installed at the release's fixed version |
| DeepSeek Harness | Native UI, conversations, model calls, files and tools | Runs inside each user's environment |

Install through this repository. The internal Connector is bundled into the platform; runtime is not a separately deployed service. Developers changing resource lifecycle work in runtime; developers changing user authorization or installation work here.

## Operate and develop

The platform process accepts `start --config /private/config.json`. Administrators use `inspect`, `stop`, `resume` and `delete` through a private Unix socket with exact allocation/instance identities. `resume` starts an environment; `start --config` starts the platform. See [operations](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/quickstart.md).

An unverified stop, missing volume or changed resource UID blocks access and requires inspection. Deleting a stopped environment retains its PVC. Platform uninstall retains control storage and user resources. Persistent storage is not a backup.

- [Installation and troubleshooting](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/installation/README.md)
- [AI installation guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/packages/multi-tenant/AI.md)
- [Contributing and local checks](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONTRIBUTING.md)
- [Release notes and artifacts](https://github.com/GuoMonth/dsh-multi-tenant/releases)

MIT licensed.
