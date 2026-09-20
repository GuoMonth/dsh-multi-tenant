> Archived snapshot; not current requirements. See the documentation index and active Issue for current scope.

# #68 / #71 原生域重构：交付契约与验收

2026-09-11：用户明确批准以下产品契约，替代此前“Principal 宿主内部继续保留独立根 grant”的要求：

> 平台按 `(tenantId, principalId)` 隔离数据与执行环境；域内沿用 DSH 原生会话、workspace、preset 和权限控制，不承诺会话之间的独立访问授权。平台管理权限始终位于用户域之外。

工作分支 `refactor/68-71-native-authority`，PR #75。DSH 固定 `0.1.5-rc.2` / `fb2c4b9e698e30edb738bca4cf0618587db7d203`。WP1–WP5 的实现与本地验收已完成，交付证据见 [WP5 报告](../evidence/native-domain-review/wp5/README.md)，远端 CI 状态以 PR 为准。源码版本 0.7.0，不代表已发布 npm。

## 职责与删除范围

平台只拥有认证、域归属、原生运行时生命周期、入口准入及执行边界。原生 DSH 拥有 Session/query/persistence、workspace、preset、MCP 组合、子代理和 Web。域用户可以操作其原生设置与凭据；不能接触平台目录、登录秘密、Docker socket、管理 API 或其他域。

删除旧 `MultiTenantService`、Agent repository、scope 重绑、runtime facade、重复历史/文件协议、自定义面板及相应 public exports。没有旧 API 兼容层或旧数据目录自动迁移。旧逐根 grant 测试退出新契约；其跨 Principal、生命周期和传输不变量由新测试及真实原生安装消费者覆盖。

保留 [WP1](../evidence/native-domain-review/wp1/README.md)、[WP2](../evidence/native-domain-review/wp2/README.md)、[WP3/WP4](../evidence/native-domain-review/wp34/README.md) 历史证据。[原始评估](native-domain-refactor-assessment.zh-CN.md) 中根授权阻塞描述代表当时契约，已被本决策替代。publication veto 不阻止历史读取的反例继续运行，用于证明不应把原生停止/发布控制宣传为根读取 ACL。

## 工作包验收

| 工作包 | 交付与验收 |
| --- | --- |
| WP1 原生组合 | 真实 preset、MCP、子/孙代理、fork、过滤、冷恢复和原生 Web；不绑定私有 scope 或复制 controller |
| WP2 生命周期 | SQLite 唯一 owner tuple、单协调器、generation、启动去重、取消、超时、失败保留所有权、全部清理尝试、SIGKILL 后隔离残留 |
| WP3 认证入口 | 公开原生认证交接、可信 owner/origin、全 HTTP/WS 准入、原始字节、Cookie 隔离、活跃流撤销及重连 |
| WP4 执行边界 | Docker 无网络/非 root/只读根与 profile/资源限制；平台及异域访问拒绝；域凭据隔离、域撤销与恢复；不合作 MCP 后代随容器释放；工作负载替换 socket 不能重定向平台 |
| WP5 安装交付 | 新 exports/声明/原生资产；独立 tarball 消费者与真实双域 Web；双语使用与边界文档；Node 22.19/24 CI 与原生 Docker/浏览器 CI |

## 生命周期与凭据契约

- 一个域一个 active writer；启动句柄同步转交资源所有权，晚到资源也必须清理。停止失败或残留未核对时不得激活下一代。
- 登录撤销关闭该登录会话的连接；域 suspend/revoke 持久化后关闭整个域连接和 Host。停止与暂停可恢复，域 revoke 为终态。
- 平台不再持有每 Agent 的 MCP/Secret 租约。MCP 由原生 preset 持有，进程后代由容器边界兜底清理；原生 credentials 存在域内。不能通过删除旧租约 API 宣称外部凭据已经撤销。
- 域能力/外部凭据轮换采用 suspend → 确认旧 runtime 释放 → 更换资产/撤销外部凭据 → enable。外部操作失败保持 suspended；不提供每根或 MCP 热轮换承诺。
- 平台 API 不暴露为原生 Remote。用户域的任意代码按只能访问本域资源处理；原生工具过滤/审批仍可减少风险，不作为跨域防线。

## 可执行矩阵

- `pnpm release:check`：版本身份、public exports、声明、单元/入口/真进程故障、SQLite 重启与打包消费者。
- `pnpm probe:isolated`：安装 tarball，复制安装资产构建镜像，通过公开 API 启动真实域；MCP、子代理、冷恢复、Web、凭据、上传、域间拒绝、撤销、恶意 socket 替换与容器恢复。
- 生命周期故障注入保留原始错误与清理错误；Docker 创建结果丢失核对唯一 claim，stop 失败仍尝试 rm，失败保留句柄待重试。
- 性能记录冷启动、同域并发热准入、原生上传、宿主内存、浏览器重连及域停止。数据是参考工作负载的观测，不推断生产并发容量。

## 明确的交付边界

默认 Docker provider 是无出站网络的 Linux 参考实现，不能直接调用外部模型和远程 MCP。公开 `RuntimeProvider` 允许部署者提供受审查网络方案；本轮不实现通用出站代理、多机调度、自动 idle eviction、团队共享或项目 ACL。默认 CPU/内存/PID 限制是配置策略，不是性能保证。共享机器上的其他项目容器和网络不清理。

取消根 grant 只消除相应产品阻塞，不免除隔离、资源清理、安装及 CI 验收。PR 完成不自动合并、不发布 npm。Issue 的结果必须描述“独立 Principal 原生 Host”，不能声称提供共享 Host 的完整 Principal 授权横截面。
