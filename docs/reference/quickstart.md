# RC2 candidate quickstart

The supported candidate is Kubernetes-only, fixed to DSH 0.2.0-rc.2. Follow the [root README](../../README.md) for prerequisites, private configuration, entry/stop/start and membership revocation. The candidate configuration is [integration/distribution/config.example.json](../../integration/distribution/config.example.json).

Install a reviewed local platform tarball with Node 24+, then run:

```sh
dsh-multi-tenant start --config /private/config.json
```

No old Cell/Process/Docker entry, Alpha state migration or public artifact availability is implied. Installation assets are owned by the installation workstream; combined real-runtime acceptance is [#106](https://github.com/GuoMonth/dsh-multi-tenant/issues/106). Keep exact platform/connector/runtime image identities in the final combined report before user E2E.
