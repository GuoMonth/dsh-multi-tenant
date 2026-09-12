# Local developer experience

This guide targets 0.8.0. Check availability with `npm view dsh-multi-tenant@0.8.0 version`; if absent, use the source flow below. 0.7.1 has no CLI. Published artifacts include a verified prebuilt image digest.

With Node 22.19 or newer 22.x, or Node 24+ and a running local Docker Engine/Desktop using Linux containers:

```sh
npx -y dsh-multi-tenant@0.8.0 start
```

Or run `npm install -g dsh-multi-tenant@0.8.0`, then `dsh-multi-tenant start`. No source checkout, pnpm, DSH installation, image build, handwritten profile or API key is required. The CLI downloads the matching image, creates local state and opens a browser. Choose Alice or Bob to start a dedicated native DSH Host.

The explicitly deterministic demo model supports “Read my sample”, “Create a file” and “Delegate to a subagent” through native tools. It is not an AI model. Configure your own provider credentials in native Settings and select a real model in the session to use real AI.

Commands: `start`, `status`, `stop`, `doctor`. Options: `--data-dir PATH`, `--port 3080`, `--no-open`; development builds accept `--image DIGEST`. Port conflicts choose a free port. Ctrl-C stops owned containers and retains data. Default control state is `~/.dsh-experience`; workspace data lives in named Docker volumes, independently of npx caches. Use the same data directory for all management commands.

Each user has a separate localhost hostname. The short-lived URL fragment establishes a host-only local session and disappears after exchange. Do not share it; rerun start for a fresh link. The launcher is loopback-only; demo identity selection is not public login/SSO. No hosts-file edits or manual certificates are required for the Chromium-verified local flow.

Linux Docker Engine is verified locally. Native Linux amd64/arm64 pass installed-CLI CI and are checked again before image publication. Desktop transport no longer relies on host Unix sockets, bind paths or UIDs, but macOS/Windows real-machine acceptance remains experimental until recorded. Remote Docker and Windows containers are rejected. Bridge networking follows Docker policy and is not network tenant isolation.

An instance pins its image, DSH and profile versions. Incompatible startup does not migrate data: use the original CLI or a new data directory. Stop does not delete volumes; there is no automatic destructive reset. Source manifests deliberately contain no pretend published image. Maintainers build runtime/Dockerfile, inspect its image ID and pass it with --image. See the [Chinese guide](quickstart.zh-CN.md) for complete source commands and boundaries.


Source verification from the repository root (use the pnpm version in package.json):

```sh
pnpm install --frozen-lockfile
pnpm build
docker build -f packages/multi-tenant/runtime/Dockerfile -t dsh-experience:dev packages/multi-tenant
docker image inspect dsh-experience:dev --format '{{.Id}}'
node packages/multi-tenant/dist/cli.mjs start --image sha256:<returned-id> --data-dir /tmp/dsh-experience-dev
```

Replace the image placeholder with the inspect output. When using npx, run management commands as `npx -y dsh-multi-tenant@0.8.0 status` (or `stop`/`doctor`); the bare executable requires a global installation. See the [AI guide](../../packages/multi-tenant/AI.md) for assisted setup.
