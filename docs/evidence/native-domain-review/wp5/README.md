# WP5：Principal 唯一授权域的安装交付证据

2026-09-11。用户批准的契约：平台按 `(tenantId, principalId)` 隔离数据与执行环境；域内沿用 DSH 原生会话、workspace、preset 和权限控制，不承诺会话之间独立访问授权；平台管理权限在域外。

DSH 固定 `0.1.5-rc.2` / `fb2c4b9e698e30edb738bca4cf0618587db7d203`。平台源码版本 0.7.0。此证据对应 PR #75，不表示 npm 已发布或 PR 已合并。

## 复现

```sh
pnpm install --frozen-lockfile
pnpm release:check
pnpm --dir scripts/native-host-probe install --frozen-lockfile
PROBE_CHROMIUM=/usr/bin/google-chrome pnpm probe:isolated
```

没有系统 Chrome 时先执行 `pnpm --dir scripts/native-host-probe exec playwright install chromium`，再运行不带 PROBE_CHROMIUM 的探针。CI 使用 Playwright 管理的 Chromium。

`probe:isolated` 将真实 tarball 安装进无源码链接的独立消费者，加载安装后的公开入口，并把安装后的 native control 资产复制进固定 Docker 镜像。模型为 keyless fixture，MCP 为真实本地 stdio 协议，只使用假凭据。两个域运行真实 CLI profile、Web、AgentPresets、子代理、JSONL 和原生 RPC/mux。该验证未使用共享 Docker bridge，不修改其他项目资源。

## 已验证行为

[report.json](report.json) 记录 16 组验收：同名 Session/MCP/路径在两域解析为各自数据；原生子/孙代理、one-shot fork、blank preset switch、工具 schema 过滤及强制调用拒绝；冷历史与子代理继续执行；原生 settings、凭据写入/描述/更新/删除只影响本域；2 MiB 二进制上传；原生 Web 发送真实工具调用、断网后重连；平台和异域文件、管理 socket、只读资产写入及网络访问拒绝；暂停、撤销、目录重启后拒绝；控制器 SIGKILL 后精确清理旧容器再启动；结束无本次拥有的容器或 pinned runtime descriptor。

MCP fixture 额外产生独立 setsid 后代并忽略 SIGTERM。容器边界最终释放全部后代，避免只确认 CLI PID 退出便交接存储。单元故障注入另覆盖创建结果丢失、错误 claim、错误 generation、stop 失败后仍尝试 rm、清理失败保留所有权及重试。凭据不再由旧每 Agent SecretLease 管理；外部服务凭据撤销由可信部署者执行，失败时保持域暂停。

[alice.png](alice.png)、[bob.png](bob.png) 及对应文本记录官方 Web 的真实回复与连接状态，没有 native 登录 token。历史 publication veto 反例保留：同 Principal 的冷列表和历史仍可读取，符合新产品契约，不再是发布阻塞。

## 对抗性审查与修正

本轮按源码与可执行反例进行审查，没有声称经过外部安全认证。

1. **容器替换 socket 路径。** 工作负载可以修改 `/control`，如果平台直接按 pathname 连接，可被符号链接引向平台或其他域。修正为 Linux O_PATH + O_NOFOLLOW 固定 socket inode，通过 `/proc/self/fd` 连接；域内将原路径换为 Docker socket 链接后，平台仍只能连接原 socket。就绪文件同步拒绝链接/FIFO，限制 16 KiB。
2. **只看创建命令返回值。** Docker create 结果丢失不代表没有容器；唯一 claim 标签决定能否回收，拒绝删除外来 claim/generation。
3. **一次清理失败提前退出。** transport、容器停止/删除和控制目录清理分别尝试，聚合错误并保留重试句柄；旧 owner 未确认释放前禁止下一代 writer。
4. **源码工作区掩盖发布缺陷。** 公共声明由独立安装的 TypeScript 编译器检查，原生资产来自 tarball；平台不再依赖旧 DSH peers 或旧 Cordis bundle。
5. **跨域页面嵌入。** 入口在保留原生 CSP 的同时增加 `frame-ancestors self`，真实浏览器拒绝其他 origin 嵌入已登录原生 Host；同源嵌入继续由原生策略约束。
6. **把冷历史读取等同激活。** 冷查询保持原生无激活语义；恢复父会话后才能继续子代理，没有为了通过测试修改上游生命周期。

## 测量与限制

本地单次完整工作负载：双宿主冷启动 3599 ms；40 个同域并发热准入 1 ms；2 MiB 上传 20 ms；浏览器断网、重连并完成下一条工具消息约 1145/1015 ms；暂停并重启约 4029 ms；域撤销约 536 ms。Alice 在包含多会话、子代理及 MCP 后代后约 379.2 MiB、48 PIDs。重连数字包含人为 500 ms 断网及模型/工具响应；热准入数字只衡量协调器复用，不是模型吞吐。

这些是测试机单次观测，没有高并发容量、长期内存增长、恶意负载压力或生产 p99 的结论。默认 1 GiB/1 CPU/160 PIDs 是参考资源限制，不据此设置自动 idle 策略。浏览器断线不回收有后台工作的 Host。

Docker reference 禁止所有出站网络；外部模型/远程 MCP 需要部署者提供受审查的 RuntimeProvider。没有共享 Host 的 Principal 授权、域内项目 ACL、多机调度、外部 Secret 服务撤销实现或通用插件安全认证。

## 旧测试与新验收的对应

旧 104 个测试中，逐 Agent facade、旧 SQLite schema、旧 panel 和旧 root grant 的实现/契约测试随对应实现删除。新主线有 32 个平台测试，另有 2 个发布门禁测试和独立安装消费者；真实 DSH 行为集中在上述 16 组安装后的原生验收中。测试数量不可直接比较，也没有把“删除旧失败路径”当成资源清理已经证明。

| 旧关注点 | 新证据 |
| --- | --- |
| Principal ownership / repository | tuple 唯一性、持久化撤销、独立 tarball 双租户同名 Principal、原生双域同 ID |
| child MCP / subagents | 原生 standing composition、子/孙级、fork、filter、冷 continuation |
| Web / observation / files | 全路径 ingress、真实 RPC/mux、原始二进制、浏览器断线重连与撤销 |
| ensureLive / lease failures | 同步句柄所有权、late acquire、超时、stop/rm 故障、SIGKILL、MCP 后代与描述符无残留 |
| root read grant | 产品契约明确取消，保留反例说明域内原生行为 |
| artifact / profile smoke | 新 exports、声明、独立安装消费者、安装资产构建原生镜像 |
