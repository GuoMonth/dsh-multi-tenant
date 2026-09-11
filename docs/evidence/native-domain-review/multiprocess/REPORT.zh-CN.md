# 每 Principal 独立原生 Host：技术验证报告

日期：2026-09-11。验证基线：DSH `0.1.5-rc.2`。结论：**原生双域最小集成验证通过，值得按这个方向进入重构；尚不满足生产授权验收，也不宣布 #68 / #71 / #65 完成。**

本次实际启动两个完整原生 Web Host，在浏览器操作并执行工具、委派、重启和故障检查。最终一次运行耗时约 33 秒，18 组检查全部通过，清理错误为零。原始结果见 [results.json](results.json)，可复现入口见 [探针说明](../../../../scripts/native-host-probe/README.md)。

## 验证对象

本项目基线为 `main@ffee4840d8e7a79c0065556b8b31f76465708fc4`。测试运行时独立安装 DSH 官方 npm 包：234 个已安装 DSH package 实例均为 rc.2；它们包含不同 peer 组合，因此不代表 234 个独立包名。依赖、配置、容器镜像摘要与实测环境均已保存。

```text
浏览器上下文 A → 宿主 loopback relay A → 容器 A 的原生 DSH Web
                                            ├─ 私有 DSH_HOME / query / Session
                                            ├─ 私有 workspace / 上传文件
                                            └─ 本域 preset → MCP / 原生子代理

浏览器上下文 B → 宿主 loopback relay B → 容器 B 的原生 DSH Web
                                            └─ 完全独立的同结构资源
```

两个域预先分配给测试 Principal Alice/Bob；未接入 Tenant/Principal 登录数据库。正式域键仍应是 `(tenantId, principalId)`，本次验证的是域分配之后的运行时行为。

容器拥有独立挂载、PID/网络边界；同一公开程序树只读共享，只把所属域的私有目录挂入容器。非 root UID、只读根、独立 tmpfs、cap-drop、no-new-privileges 和资源限额都实际启用。两个域分别位于 internal Docker bridge，不能直接互连或访问外网。

没有使用真实模型密钥。测试 LlmAdapter 按指令产生真实工具调用，MCP 服务通过官方 SDK stdio 协议读取各自文件中的合成标记。原生 AgentPresets、loop、工具执行、子代理、存储、查询和 Web 都实际运行；没有重写这些所有者，也没有加载旧的 multi-tenant runtime-driver。

## 已通过的行为

| 范围 | 实际检查及结果 |
| --- | --- |
| 原生认证 | 启动 token 经原生 303 交换为 Cookie；无认证 401、错误 Origin 403；把另一 Host 的 Cookie 值换成目标 Cookie 名仍为 401 |
| 原生能力装配 | 两域使用同名 preset 和 `mcp__principal__identity`，根 Agent 只读到自己文件中的标记 |
| 子代理继承 | 由原生 `spawn` 创建 continuable 子代理；不手动 bind scope、不复制 MCP，子级仍读到所属域标记 |
| 子级工具限制 | `toolFilter: { allow: [] }` 从模型 schema 排除 MCP；模型强行请求该工具时实际执行返回 `unknown tool` |
| 列表与搜索 | 本域 Session 可列出，本域标记可搜到；另一域 Session 不出现、另一域标记搜索为空，避免“索引始终为空”的假通过 |
| 伪造 Session | 向本 Host 提交另一 Host 的 Session ID：prompt 拒绝，native follow 返回错误 |
| 文件读取 | 原生 `/api/file` 能读所属 workspace；另一域宿主路径不能读取；直接在容器中访问同一路径也不存在 |
| 上传 | 原生二进制上传路由为本域 Session 签发 receipt；用另一域 Session ID 上传失败 |
| 网络与管理面 | 容器间直接 TCP 连接被阻断；容器看不到 Docker socket |
| 官方 Web | 两个 Chromium 上下文均完成首次提示、目录选择、输入消息、MCP 调用和回复显示，无 pageerror；页面不含另一域标记 |
| 主动事件 | 实际观察 Alice 36 帧、Bob 39 帧；各自含本域 Session ID，不含另一域根 Session ID，并非检查空流 |
| 正常停止 | Alice 在约 615 ms 内退出，退出码 0；Bob 随后继续接受消息并回复 |
| 根会话恢复 | Alice 重启后读回原历史，继续同一个 Session ID 并生成新回复 |
| 子代理冷恢复 | 重启后把 Alice 文件改为新标记；原 child ID 继续执行 MCP 并返回新标记，排除只是读到旧历史的假通过 |
| 限制冷恢复 | 原受限 child ID 在重启后重新检查 schema，仍看不到被禁止的 MCP |
| 崩溃隔离 | 对 Alice 发送 SIGKILL，确认退出码 137；Bob 继续回复，Alice 再启动后继续原 Session；此项为无进行中写入的故障样例 |
| 清理 | 浏览器、连接、两个容器、两个网络和私有临时数据已释放；按本次唯一 label 检查无容器/网络残留 |

浏览器证据：[Alice 官方 Web](alice-official-web.png)、[Bob 官方 Web](bob-official-web.png)。原生初始历史、child catalog、上传 receipt 和页面文字也保存在本目录，内容均为合成测试数据。后续恢复与限制检查由可执行断言和结果记录支撑，不把初始历史文件充作重启后的快照。

## 实测资源成本

每容器限制 1 CPU、1 GiB 内存、128 PID；宿主与浏览器不包含在容器内存中。

| 指标 | Alice | Bob |
| --- | ---: | ---: |
| 新域创建至可认证请求 | 3,596 ms | 3,591 ms |
| Web 与工具运行后的容器内存 | 309.8 MiB | 323.6 MiB |
| `docker stats` PIDs | 29 | 29 |
| 正常停止 | 615 ms，exit 0 | 未单独测量 |
| 已有域重启至可认证请求 | 3,566 ms | 未单独测量 |

这是单机、两域、轻负载样本。新域启动包含目录/网络/容器创建，但不包含依赖安装、镜像拉取或冷宿主缓存；PIDs 包含线程，不代表 29 个用户进程。不能据此宣称已知高并发容量或停机数据一致性上限。

工程含义是：域隔离可行，但长期为所有 Principal 保留活跃 Host 有实际成本。第一版应按需启动，并在识别原生后台工作之后回收空闲域。必须另测启动峰值、活跃域增长和回收策略，不能仅根据浏览器断开判空闲。

## 对架构判断的影响

**#68 的核心组合路径得到正面证据。** Principal 的能力放在域内受管理 preset，原生 `mount / composeFrom / cold continuation` 会自然传播。没有必要再把父 Agent 自身层复制给子级，也不需要接管 AgentPresets 的私有 parent binding。拆进程本身并不修复旧装配；能力所有权仍必须调整。

**#71 的完整官方 Web 路线得到最小可行性证据。** 原生 UI、Remote、主动事件和直接文件路由可以继续使用同一 Host 的私有数据源，无需复制 Session 控制器和聊天 UI。这并不代表平台授权已经实现：实验入口只是两个固定目的地的字节 relay。

**每 Principal 独立文件区域成立，但目录不是安全边界。** 本次越权失败同时依赖独立挂载与网络边界。不能把结果外推为“同一 UID 的两个普通 Node 进程，各设一个 DSH_HOME 就足够”。

**#65 仍没有关闭依据。** 实验说明容器级正常退出、异常退出和探针资源释放可验证。它没有删除或检验旧 `ensureLive` 路径，更没有证明正式 supervisor 在双启动、释放失败、撤销竞态下无泄漏。

## 对抗性复核与下一阶段门槛

| 尚成立的反例 | 必须落地的职责/测试 |
| --- | --- |
| 登录 A 后修改目标域、内部端口或内层凭据，进入 B | 平台入口根据可信身份解析域；内部 Host 不直接暴露；HTTP、Fetch、WS 统一准入 |
| 切换账号或登出后，旧浏览器 Cookie / WS 继续有效 | 外部认证与 DSH 内部认证分离；生产独立 origin、Cookie 策略、连接 generation、撤销、迟到响应与重连验证。不同端口不隔离 Cookie，本次分离上下文不能证明同一浏览器账号切换安全 |
| 两个控制请求同时启动同域、旧 Host 未退出便接入新 writer | 持久单 owner、合并启动、明确就绪 generation；旧 owner 未释放时禁止新 writer；必要时存储 fencing |
| 撤销一根 Agent，但其后台子级或冷恢复仍有域能力 | 明确 root grant 与域 grant 的产品语义，验证撤销、后代、正在执行工具及 MCP reconnect；不得把每根差异授权悄悄扩大为域能力并集 |
| 用户修改 preset、Settings 或安装插件，越过平台权限 | 审查正式 profile 的所有能力和入口；不能把用户可写配置当可信授权策略；平台秘密不进入 worker |
| 子孙级、fork、preset generation 改变、tool shadow 或 FS policy 组合不符合预期 | 增加真实契约样例；本次只覆盖直接 continuable 子级与 inherited toolFilter |
| 停机发生在工具、上传、持久写入或回收竞争中 | 注入进行中调用、disposer 失败、取消/迟到 acquisition、强杀写入等失败；本次 idle SIGKILL 不能证明这些语义 |

没有运行所有 Web 路由、queue/steer/stop、审批结果回传、设置/插件管理、桌面能力、Node 22.19、跨节点、容量压力或真实外部 provider 测试。MCP reconnect 在 fixture 中关闭。原生沙箱也没有被当作跨 Principal 安全保证。

原生 Web CLI 保持受支持的 loopback 监听，实验用两个透明 relay 贯通私有网络；生产代理需要单独处理认证和连接撤销。重启检查等待当前启动的新就绪记录，避免把旧日志当作新 Host 已就绪——正式运行时管理器同样需要明确 generation，不能简单匹配历史日志。

下一步可以开始替换主线的第一个纵向切片：**可信入口 → 单 owner 域运行时 → 私有域存储/环境 → 原生 profile**，把域内 Session/子代理/Web 交给 DSH。通过上述授权、撤销及失败测试后再删除对应旧实现、重写公开契约，并按新语义验收 Issue。

变更范围为文档、独立实验及证据；主项目产品源码、依赖和根锁文件未修改。技术验证阶段执行 `pnpm verify` 通过（package/contract 校验及 2 个工程门禁测试）；新增 JavaScript 语法检查、实验锁文件与实测运行时一致性检查、文档本地链接检查通过。原生双 Host 探针的运行环境与现有产品的发布矩阵应分别记录，不能相互替代。

PR 准备阶段另在本机 Node 24 执行 `pnpm release:check`，全部通过：发布契约、peer 校验、类型检查、78 项现有测试、构建、SQLite 探针和 packed consumer smoke。Node 22.19 的现有产品矩阵由仓库 CI 检查；双 Host 探针仍只具有本报告列出的 Node 24 本地验证证据。
