# WP2 域目录与原生运行时生命周期

2026-09-11，分支 `refactor/68-71-native-authority`。本阶段实现内部域目录、协调器、Linux 开发用进程 provider 和原生 readiness 插件，并让实际 DSH `0.1.5-rc.2` Web 成为消费者。原有包入口尚未替换；新模块暂不公开导出。

## 已实现的契约

| 模块 | 行为 |
| --- | --- |
| `src/domain/sqlite.ts` | 独立 `domains_v1` 表，owner tuple 唯一；不透明 UUID、持久 desired state、revision、generation 和未释放标志；不读取旧 Agent 表 |
| 同目录协调器锁 | 独立 SQLite 排他事务阻止第二个 active coordinator；操作系统在进程退出后释放此锁，但不因此宣称旧 runtime 已退出 |
| `src/runtime/coordinator.ts` | 每域启动去重；就绪身份/版本/代次校验；启动取消与超时；准入 signal 失效；幂等停止、失败保留、重试及并发关闭 |
| `src/runtime/provider.ts` | acquire 同步交出 cleanup handle，再异步等待 ready；stop 成功必须代表所有获取过程与资源释放均已结束 |
| `src/runtime/providers/local-process.ts` | 显式环境、无 shell、loopback HTTP + IPC readiness；SIGTERM 后必要时 SIGKILL；检查 Linux 进程组，包含普通子进程 |
| `src/native/runtime-control.mjs` | 使用公开 `appReady.onReady`；读取固定安装的实际 CLI manifest 版本，通过内部 IPC 报告；协调器 IPC 断开时请求原生 appExit |

状态和授权分离：`stopped → starting → ready → stopping → stopped`；失败进入 `failed`。`suspended` 可以重新启用；`revoked` 不可重新启用。域级撤销先落库，再使旧 admission 失效并停止运行时。这不是根 grant 撤销，也还没有浏览器入口消费 admission。

## 验证

在仓库根目录执行：

```sh
pnpm --filter dsh-multi-tenant exec vitest run tests/runtime
pnpm --dir scripts/native-host-probe install --frozen-lockfile
pnpm probe:runtime
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

本次在 Linux / Node `v24.18.0` 执行：新增 17 个 runtime 测试通过；全量 95 个测试通过，typecheck、build、verify 通过。未在本次运行 Node 22 矩阵。原生 probe 不需要 Docker、浏览器或模型密钥；使用 WP1 独立锁文件中的真实 DSH CLI。原生报告见 [native-report.json](native-report.json)。

原生实验覆盖两个 Web profile、同域并发启动去重、原生认证保留、故障插件不进入 ready、单域停止不影响另一域、失败启动清理、代次递增、持久域撤销和干净重启。成功后删除测试运行时数据，保留报告；清理失败会使实验失败并保留目录。

故障/并发测试包括：

- 40 个同域并发请求只获取一个 handle；同名 Principal 在不同 tenant 下拥有不同域。
- 启动超时并且释放失败时，两条错误都保留；其他域仍可运行，失败域禁止接管。
- 撤销先落库，晚到的资源必须由原 handle 释放；旧 readiness 晚于新 generation 到达也不会覆盖它。
- 停止超时保留未释放状态；持久化 stopping 失败也继续尝试实际资源清理。
- shutdown 尝试所有域，保留失败域 handle 和目录锁，修复后可以重试；关闭立即取消尚未开始的启动。
- 真实子进程 spawn 失败、无 readiness、版本错配、忽略 SIGTERM 的进程组，以及监听 socket 回收。
- 实际 SIGKILL 协调器后，旧测试宿主仍能响应；新协调器获得目录锁，但拒绝为该域启动第二个宿主。

## 对抗性自审及当前边界

这是单人自审与可执行反例，不是独立多人审计。实现将单协调器锁与运行时资源是否释放分开处理，没有使用 PID 存在、端口关闭或数据库 ready 字段作为重新接管的依据。

**崩溃后的默认恢复策略是拒绝接管。** 目录重新打开时，所有 `unresolved = 1` 的域标记为 failed，仍保留未释放事实。当前本地 provider 不提供自动清除这些记录的接口；即使原生 appExit 已成功退出，也不能仅凭猜测恢复域。这保护了所有权，但存在明确的可用性限制：这些域需等待受限 provider 提供可验证恢复。不要通过删除目录锁、清空 journal 或复用旧 PID 来绕过。其他无残留的域可以继续运行。

开发 provider 假设平台独占目录和固定配置，同一控制目录只有一个 active coordinator。它没有阻止不同目录的错误部署映射到同一存储；也不阻止工作负载用 setsid 逃离进程组，更不提供 FS、网络、Secret 或用户身份隔离。这些约束需要 WP4 的受限 provider 承担。Linux `/proc` 权限不足导致无法核对进程组时按失败保留所有权。

原生 profile 在本阶段由平台生成。运行中的 profile/能力变更、完整认证交接、全部 HTTP/WS 路由准入和连接撤销尚未接入；root grant 撤销与 #65 的真实 MCP dispose 故障链也没有因此完成。此次不关闭 #68、#71 或 #65。

## 下一步

WP3 使用 RuntimeAdmission 接入完整原生 Web：从可信认证结果选择域，校验 Host/Origin，转发 HTTP/WS，并让每个现存流随 signal 失效。DSH 公开的 `connection.authenticatedUrl` 是待验证的内部认证交接入口，不沿用 WP1 的日志提取方案。WP4 同时补齐受限执行与可验证恢复，WP5 才替换公开入口与打包交付。
