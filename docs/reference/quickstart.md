# Local developer experience

This documents the unreleased 0.8.0 source. 0.7.1 has no CLI. Published CLI artifacts require a verified prebuilt image digest.

After release, with Node 22.19+/24+ and a running local Docker Engine/Desktop using Linux containers:

```sh
npx -y dsh-multi-tenant@latest start
```

Or install globally and run `dsh-multi-tenant start`. No source checkout, pnpm, DSH installation, image build, handwritten profile or API key is required. The CLI downloads the matching image, creates local state and opens a browser. Choose Alice or Bob to start a dedicated native DSH Host.

The explicitly deterministic demo model supports “Read my sample”, “Create a file” and “Delegate to a subagent” through native tools. It is not an AI model. Configure your own provider credentials in native Settings and select a real model in the session to use real AI.

Commands: `start`, `status`, `stop`, `doctor`. Options: `--data-dir PATH`, `--port 3080`, `--no-open`; development builds accept `--image DIGEST`. Port conflicts choose a free port. Ctrl-C stops owned containers and retains data. Default control state is `~/.dsh-experience`; workspace data lives in named Docker volumes, independently of npx caches. Use the same data directory for all management commands.

Each user has a separate localhost hostname. The short-lived URL fragment establishes a host-only local session and disappears after exchange. Do not share it; rerun start for a fresh link. The launcher is loopback-only; demo identity selection is not public login/SSO. No hosts-file edits or manual certificates are required for the Chromium-verified local flow.

Linux Docker Engine is verified locally. Native arm64 is gated by the image publication workflow. Desktop transport no longer relies on host Unix sockets, bind paths or UIDs, but macOS/Windows real-machine acceptance remains experimental until recorded. Remote Docker and Windows containers are rejected. Bridge networking follows Docker policy and is not network tenant isolation.

An instance pins its image, DSH and profile versions. Incompatible startup does not migrate data: use the original CLI or a new data directory. Stop does not delete volumes; there is no automatic destructive reset. Source manifests deliberately contain no pretend published image. Maintainers build runtime/Dockerfile, inspect its image ID and pass it with --image. See the [Chinese guide](quickstart.zh-CN.md) for complete source commands and boundaries.
