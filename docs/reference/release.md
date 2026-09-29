# RC2 candidate and release boundary

No publication is authorized during the current implementation wave. Do not run npm publish, push public product images, or create a Release. The user decides after final E2E. Old Cell/Process/Docker publication paths have been removed.

For local candidate preparation, use the manifest-pinned tools and run `pnpm install --frozen-lockfile` then `pnpm release:check`. These checks do not publish. Pack with `npm pack --ignore-scripts` from `packages/multi-tenant` after building; `integration/distribution/Dockerfile` installs that reviewed archive into the platform image.

The integration owner must record both repository commits, DSH 0.2.0-rc.2 / 639ed015397290b3745d163aafe02ffee4aa3f84, connector archive SHA256/SHA512, platform archive integrity, workload/platform/upstream controller digests, and the actual cluster/OIDC/model/tool verification. A contract-only connector fixture or package build is not production runtime acceptance.

After separate user publication authorization, define a new release job against the exact reviewed candidate and actual image identities. Do not resurrect deleted legacy gates or follow floating latest. There is no supported Alpha migration, backup/restore or disaster-recovery promise in this MVP.
