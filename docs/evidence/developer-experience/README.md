# One-command experience evidence

2026-09-12, issue #78, source 0.8.0, Linux x64, Node 24.18.0, local Docker 29.6.2, Google Chrome via Playwright. Source is not published.

- `pnpm release:check`: passed; 40 package tests, 4 script tests, typecheck/build, SQLite recovery probe, independently installed SDK consumer.
- `scripts/experience-smoke.mjs`: passed against the local image built from runtime/Dockerfile, using an independently packed/installed npm package, npm bin resolution and its real CLI.
- Browser: one-time bootstrap, Alice/Bob distinct localhost origins, real native DSH Web, private sample MCP, file creation, native child catalog, restart and retained file, explicit native turn-history query, CLI SIGKILL and exact orphan recovery. Direct unauthenticated/native token-exchange access to the worker relay returns 401.
- The restart test removes the local seeding marker to cover interrupted publication; native session facts prevent duplicate creation.
- `linux-report.json` is the runner result. Its launchMs measures the final CLI process readiness, not image download or first native Host startup; it is not a product performance claim. Screenshots show the native entry state.
- `pnpm probe:image`: native readiness/tools plus bridge HTTPS egress and explicit none blocking passed.
- `pnpm probe:isolated`: all 16 existing SDK native/browser/isolation/recovery checks passed after the shared native bridge change.
- Separate agent-browser verification confirmed the launcher renders, exchanges its bootstrap and enters the official Web. No custom chat implementation is used.

Not executed here: macOS/Windows Docker Desktop hardware, native arm64, public GHCR anonymous delivery, npm publication or real paid model calls. Native arm64 is gated in the reusable image publishing workflow. These checks remain distinct from the Linux proof; no cross-platform certification is claimed.
