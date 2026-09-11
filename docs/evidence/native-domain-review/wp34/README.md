# WP3 / WP4：隔离宿主、原生入口与根授权反例

2026-09-11，DSH `0.1.5-rc.2`。机器结果见 [report.json](report.json)，官方 Web 截图见 [Alice](alice.png)、[Bob](bob.png)。这是本地 Linux 的真实 Docker / MCP / HTTP / WebSocket / Chrome 实验，不是 mock 原生控制器。

**状态：Principal 域入口及受限宿主实验通过；独立根级授权仍是发布阻塞项，WP5 尚未通过。** 报告中的 `passed` 表示所列实验及反例断言通过，不能解释为全部产品验收通过。

## 可复现命令

```sh
pnpm install --frozen-lockfile
pnpm --dir scripts/native-host-probe install --frozen-lockfile
docker build -f scripts/native-host-probe/Dockerfile.runtime -t dsh-runtime-wp4-probe .
PROBE_CHROMIUM=/usr/bin/google-chrome pnpm probe:isolated
```

Linux、Docker、Node 24、pnpm 11.7.0；也可安装 Playwright Chromium 后省略 `PROBE_CHROMIUM`。运行镜像按实际 digest 交给 provider。全量 103 个测试及 `pnpm release:check` 通过；其中打包 smoke 验证的仍是现有公开包入口，不能算 WP5 新接口的打包验收。该镜像是带 keyless model/MCP 的验证镜像，不能当成完成后的生产镜像发布。构建需要依赖仓库访问，工作负载容器本身没有外部网络。测试结束清理自己创建的容器和运行时数据，保留报告及截图；构建镜像作为重复实验缓存保留。

## 通过的行为

- 公开 `connection.authenticatedUrl` 完成原生凭据交换；凭据经 IPC 或各域私有控制目录交给平台，浏览器只携带外层登录 cookie，原生 cookie 不下发。
- 同一入口准入覆盖所有 HTTP 路径与 WebSocket upgrade。验证外部 Host/Origin，再映射内部 authority；剔除浏览器 Cookie、Authorization、Forwarded 与身份头。
- 相同 Session ID、MCP 名和文件路径，在两个域分别解析为各自的真实 MCP 数据；外层 cookie 不能在另一域 origin 使用。
- 原始二进制上传、HEAD、HTTP 流、WebSocket 二进制帧和正在撤销的连接在协议测试中通过；原生 HTML、RPC、mux、MCP 与官方 Web 的消息和重连在容器中通过。
- 容器使用非 root 身份、只读根文件系统、只读 profile、独立可写数据目录、资源限额、cap-drop ALL 和 no-new-privileges；network=none，无发布端口，经私有 Unix socket 转发。
- 从真实容器执行文件与网络访问：其他域、平台目录、Docker socket 不可读，profile 与系统目录不可写，外部网络不可达。
- 真实 SIGKILL 协调器后旧容器仍存在；恢复校验部署/domain/generation 标签，移除准确的旧容器后才清除 journal，再启动新 generation。不会把 PID 或曾经 ready 当成释放证明。
- 登录撤销关闭已经连接的原生 mux；域撤销取消原 admission 并删除容器，另一域仍可用。

## 根授权反例及发布阻塞

实验先创建有真实 MCP 历史的根 Session，然后停止宿主，装入一个使用公开 `session/created` 同步 veto 的最小原生插件，拒绝这个根的再次 publication，再重启宿主。

实测结果：

| 调用 | 结果 |
| --- | --- |
| `session/prompt` 对目标根的重新激活 | 被 veto 拒绝 |
| 原生 `session/list` 的冷会话目录 | 目标根仍可见 |
| 原生 `session/follow` 的冷历史 | 仍返回之前的 MCP 测试数据 |

这证明 **原生 publication 门禁加 Principal 宿主隔离，不足以完成根级读取撤销**。这不是 DSH 的认证漏洞，也不证明所有可能的自定义 provider 都不可行。要保留独立根授权，需要进一步形成一致的 query/persistence/file/execution 边界，而不是仅挂一个创建事件或改写几个 Web 返回值。

固定版本源码依据：

- [Session publication 与同步 veto](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/core/session/src/index.ts)。
- [原生会话目录组合 live 与 persisted 记录](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/session-query/session-query/src/corpus.ts)。
- [原生本地 sandbox 的文件读取范围](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/sandbox/sandbox-local/src/profiles.ts)：限制写入不等于根级读取隔离。

用户已批准的方案明确保留根 grant 不变量。在改变这项产品契约或补齐可验证边界之前，不删除旧授权实现，不把 archive/Stop 代替撤销，不关闭 #68/#71/#65，不宣称 WP5 或发布完成。产品取舍问题已提出；未收到新选择时继续保留该要求。

## 审查边界

这是单人自审和可执行反例，不是独立多人审计。网络完全关闭的参考 provider 不能访问外部模型服务；允许 egress 的生产参考部署仍需独立策略验证。私有控制目录位于每个域自己的容器边界内，域内任意代码属于同一 Principal 权限，不能将其当作独立根之间的隔离。动态配置/插件管理、完整事件结果反例、MCP/Secret 释放故障矩阵和 packed consumer 交付仍未全部完成。

此次样本的两个宿主冷启动约 3.9 秒，一个已运行 MCP 的容器约 308 MiB / 23 个进程或线程。这是单机样本，不是容量承诺或完整性能矩阵。

CI 新增独立的原生入口实验 job，并只上传报告和截图，不上传含原生凭据的运行时目录。合并 #74 后尝试重跑其原始双 bridge 探针时，共享 Docker 地址池耗尽，第二个网络创建被拒绝；该次自有资源已清理。新的 network=none 实验在合并后再次通过，不依赖这个地址池。
