# Cell alpha release runbook

Current target: `dsh-multi-tenant@0.9.0-alpha.1`, npm **latest**, GitHub **Release / Latest**. The version name explicitly identifies Alpha maturity; do not enable GitHub Pre-release. Runtime [v0.3.0-alpha.1](https://github.com/GuoMonth/dsh-isolated-runtime/releases/tag/v0.3.0-alpha.1) is public and the exact image pair is bound in the manifest. npm publication uses the manual workflow below. Historical 0.8.0 workbench instructions are in [archive](../archive/v0.8/docs/reference/release.md).

## Coordinated inputs

The runtime repository owns Cell/Operator images and their source/DSH acceptance. The platform repository owns its npm package, OIDC ingress and platform container. It bundles the pinned private Connector (with its license); it does not publish a second runtime service or rebuild runtime images.

`packages/multi-tenant/cell-release.json` records the fixed runtime, Connector, DSH and platform version. Null images and `source-candidate` explicitly mean publication is pending. Never substitute old standalone images just because they are already public. `runtime-manifest.json` belongs to the retained historical SDK and is not the Cell CLI's release identity.

## Fixed dependency boundary

Current DSH: `0.1.5-rc.2` at `fb2c4b9e698e30edb738bca4cf0618587db7d203`. Release Cell/Operator images must be publicly pullable and fixed by digest; deploy the platform image by digest as well. A bound manifest may be checked again with the same inputs, but cannot silently accept another release tag or image pair. Changing the combination is an explicit new iteration, with affected-flow validation and no historical compatibility obligation. Candidate null digests mean unpublished; they never enable fallback to an old public image.

## Before authorized publication

1. Review/merge the coordinated runtime documentation/channel PR and then this platform PR. No runtime API change is required by the CLI. Keep Issue #82 as the integration record.
2. Run `pnpm release:check`. This includes the packed npm consumer check and platform tests. Use the [regression report](../evidence/cell-regression-2026-09-20.md) for unchanged core behavior, plus [delivery verification](../evidence/alpha-delivery-2026-09-20.md) for this package. Do not substitute old standalone installation gates for integrated acceptance.
3. Obtain the accepted **public** Cell and Operator digests for the manifest's runtime source/DSH combination. Publication is blocked until those artifacts exist and can be fetched anonymously. Review the runtime release manifest against the fixed source and images. A public repository alone does not make GHCR images public.
4. Dispatch the manual `Publish package` workflow on the reviewed main commit with that runtime release tag and its exact public image digests. Binding rejects source/DSH/image disagreement and anonymous image lookup failures. The workflow no longer builds the old platform-owned DSH runtime image.
5. The workflow packs/checks the Cell entry points, publishes via npm Trusted Publishing to `latest`, verifies exact registry version/tag and creates a matching GitHub Release marked Latest. No npm publish or moving tag is performed by local checks or PR creation.
6. On a clean consumer, install the exact published package, build the platform container using `integration/distribution/Dockerfile`, record its digest and follow [startup](quickstart.md). Save the final versions, digests and narrow installation result to Issue #82 before inviting users. Source-level regression is not proof that a public artifact has been installed.

No cluster installer, macOS matrix, upgrade compatibility, HA, migration or recovery guarantees are added. Both npm projects use latest for future authorized releases; runtime npm 0.3.0-alpha.1 supplies the pinned Cell release/deployment manifests, while the platform npm runs the OIDC/user server. The historical 0.2 standalone launcher is not the current runtime entry.
