# Native Host feasibility probe / 原生宿主可行性实验

This WP1 fixture boots two **real DSH 0.1.5-rc.2 Web profiles**, including the
official client, AgentPresets, AgentLoop, JSONL, MCP and subagent runtimes.
Only the model and the MCP test identity data are fixtures. It does not mount
the old multi-tenant service, change scope bindings, or replace native controllers.

## Run

Requires Linux, Docker, Node 24 and pnpm 11.7.0. From the repository root:

```sh
pnpm --dir scripts/native-host-probe install --frozen-lockfile
PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm --dir scripts/native-host-probe exec playwright install chromium
pnpm probe:native-host
```

An existing Chrome executable can be used explicitly instead of downloading a
browser: `PROBE_CHROMIUM=/usr/bin/google-chrome pnpm probe:native-host`.
The report records the browser and container Node versions. The base image is
digest-pinned; the full native runtime uses its own frozen lockfile, independently
of the smaller plugin dependency graph. Installation/build requires registry
access; model calls require no keys or external services.

Each run creates uniquely named test containers, volumes, an internal Docker
network and an image. Docker-internal networking has no ordinary external egress;
a host-side loopback byte relay provides browser access. The native DSH listener
stays on container loopback. This relay is a **test carrier**, not an authenticated
production gateway. Both test containers share the internal network; this is not
a proof of per-domain network isolation.

The runner obtains the native browser cookie through the official CLI launch URL,
keeps credentials in memory, redacts launch tokens from failure logs and removes
its Docker resources on normal completion or a caught failure. Cleanup errors
fail the run. Evidence is retained in the printed `/tmp/dsh-wp1-*/` directory.
An externally killed runner may require removal of its exact, uniquely named
resources; do not use Docker prune or remove other runs' resources.

## Covered behavior

- Same Session ID, preset and MCP name in separate domains resolve different private markers.
- Native child/grandchild delegation, one-shot fork and blank-session preset switching.
- Restricted child schemas omit MCP, and a model deliberately forcing the tool receives rejection.
- Real Host stop/start, cold child history, continuation and retained child restrictions.
- Native file reads, cross-host cookie rejection and raw upload.
- Official browser UI displays its domain's sessions, sends messages, reconnects its mux,
  sends again and opens settings in independent browser contexts.

The proof does **not** implement the production login gateway, all-route admission,
root/Principal revocation, arbitrary per-root grants, production FS/network policy,
capacity management or fault-injected supervisor lifecycle. It does not close
#68, #71 or #65. The minimal probe preset proves composition with real AgentPresets;
it is not a qualification of every shipped preset or arbitrary third-party plugin.

## 中文说明

WP2 的新协调器与真实原生 CLI 联调可独立运行：`pnpm probe:runtime`。
该命令使用此处的冻结依赖，无需 Docker 或浏览器；结果和限制见
[WP2 证据](../../docs/evidence/native-domain-review/wp2/README.md)。

这是重构 WP1 的真实原生链路实验。它使用官方完整 Web 和原生 preset/Agent/子代理，
不会通过重绑 scope、复制工具或替换控制器获得通过结果。

执行上述命令即可复现；也可以显式指定已有 Chrome。实验使用两个独立数据卷，
相同 Session ID、preset 和 MCP 名称故意制造标识冲突，以验证实际域归属。
成功报告、两个浏览器截图和页面文字保留在打印的临时证据目录；登录 token 不写入报告。

报告只证明列出的功能路径。测试 loopback relay 不是生产认证代理；两个容器仍共享内部网络。
域生命周期、完整入口授权、根/Principal 撤销、真正的执行隔离和容量验收由 WP2–WP4 完成。
本实验不表示三个 Issue 已解决，也不宣称支持一个共享 Host 内的多 Principal 授权。

## Authenticated isolated runtime experiment

`pnpm probe:isolated` exercises the new ingress and Docker provider with the real native Web. Build its image first with `docker build -f scripts/native-host-probe/Dockerfile.runtime -t dsh-runtime-wp4-probe .` from the repository root. See the [WP3/WP4 report](../../docs/evidence/native-domain-review/wp34/README.md) for requirements, successful checks, and the root-authorization counterexample that still blocks WP5. This image is an offline test fixture, not a production release.
