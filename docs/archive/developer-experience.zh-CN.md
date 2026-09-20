> Archived snapshot; not current requirements. See the documentation index and active Issue for current scope.

# 一行启动的开发者体验：评估与实施规划

状态：提案，尚未实现、发布或验证。基于 main `cef1a3b` / 0.7.1，2026-09-12。

## 目标与推荐决策

开发者只需预装 Node/npm 与可用 Docker，执行一条命令，得到可交互的原生 DSH Web。无需克隆源码、安装 pnpm、构建镜像、写 profile、编写认证或配置 hosts/TLS。首次下载不承诺固定耗时，但必须显示真实进度。

建议以 `npx -y dsh-multi-tenant@latest start` 为唯一首页主路径。包提供 CLI，自动拉取项目发布的精确版本 runtime 镜像，配置本地体验入口并启动独立 Principal Host。保留现有平台 API；CLI 是它的标准使用者，不重写 Agent、Session 或 Web。

以上是拟议命令，0.7.1 没有 bin，不能执行。初版版本号待发布范围确定；latest 只选择启动器版本，启动器内部使用固定 DSH、profile 与镜像 digest，不跟随浮动 DSH latest。

## 首次用户旅程

1. 执行 start。显示 Node/Docker 检查结果；Docker 未启动时给出明确修复动作，不输出未经处理的堆栈，不自动降级成本地进程。
2. 拉取缓存缺失的预构建镜像，显示阶段、下载进度、重试和取消状态。用户机器不编译运行镜像。
3. 自动生成私有数据目录、版本状态与受管理 profile；默认不挂载用户当前工程目录，不导入用户凭据。
4. 启动本机体验入口，自动打开浏览器；无桌面环境时打印可使用的本机地址与说明。默认不监听公网，不自动建立 tunnel。
5. 首屏是简短的体验入口：进入 Alice 的工作台、进入 Bob 的工作台、连接自己的模型。身份选择只属于本机演示模式，不是生产账号系统。
6. 进入官方 DSH Web。预置少量样例 workspace/文件及三项明确操作：读取当前用户样例、生成文件、委派子代理。默认使用明确标识的确定性演示模型，不伪装成真实智能模型，也不要求先输入 API key。
7. 在原生设置可覆盖的范围内接入真实模型；若需要新增向导，仅负责域内配置，不构建另一套聊天 UI。配置真实模型必须由用户显式进行，凭据不放 URL、日志、平台共享配置或演示身份间的共享存储。
8. Ctrl-C 停止本次实例管理的 Host，保留数据。再次 start 复用数据。重复启动同一实例应返回已有入口，不能竞争 SQLite 或创建重复 writer。

一行命令的前提必须诚实：默认路线需要 Docker。无需 Docker 的 npm 原生安装路线是另一项能力，不应以静默降级实现。

## 路线比较

| 路线 | 开发者前提 | 实施与维护 | 结论 |
| --- | --- | --- | --- |
| npm CLI + 预构建 runtime 镜像 | Node/npm、Docker | 自动编排现有平台 API；必须解决 Desktop 传输 | 推荐主线，保留独立用户 Host |
| npm CLI 自动安装本机 DSH | Node/npm | 原生依赖安装、缓存、Node ABI、各 OS 进程树清理；同 UID 不构成隔离 | 后续显式 local 模式，不能代替隔离体验 |
| Docker Compose 标准发行包 | Docker Compose | 平台和 worker 网络/卷、初始化、升级需标准化 | 第二入口，可免宿主 Node，尽量共享同一装配 |
| 单容器内平台 + 多个 DSH 进程 | Docker | 启动容易，但平台秘密与多个用户进程在同一执行边界 | 不作为当前多用户隔离架构的主路径 |
| 平台容器挂 Docker socket 再创建 worker | Docker | 引入平台容器 Docker 权限、daemon 路径与 UID/卷解析 | 需专门实现，不能把现有 CLI 塞进镜像就承诺可用 |

## 已有基础与实际缺口

可复用：DomainRuntimeCoordinator、SQLiteDomainRepository、认证 ingress、DockerRuntimeProvider、runtime Dockerfile、原生 runtime-control、安装产物与原生浏览器验证。

缺少：npm bin、可持续运行的体验 app、镜像发布、跨平台 runtime transport、自动 profile、演示模型产品化、首次登录桥接、数据/实例管理、进度和故障诊断。现有 probe 是自动验收脚本，会清理实例，不是可直接交付的开发者启动器。

当前 LocalProcessRuntimeProvider 硬依赖 Linux /proc；DockerRuntimeProvider 也检查 Linux 和同 UID/GID，通过宿主 bind mount 的 Unix socket 通信。Docker Desktop daemon 位于 VM，不能从 Linux 验收推导 Desktop 可用。npm 直装原生 DSH 同样不是天然跨平台。

## 技术方案

### CLI 与体验 app

同一 npm 包新增 bin 与独立 cli/app 模块；避免立刻拆多个 npm 包。CLI 负责预检、版本资产、实例锁、启动、进度、打开浏览器和退出。体验 app 持有身份会话、可信 origin 映射与协调器。原生 bridge 继续只做就绪与传输。

首期拟议命令：start、status、stop、doctor；start 提供 --port、--data-dir、--no-open。清理数据单独设计 reset，要求明确选择与确认；stop 不删除数据。后台守护启动不是首期必要条件。

本机体验与未来 serve/生产部署必须显式分开。演示身份入口不能随 host 参数变成公网任意登录接口。

### 本机浏览器身份

目标是零 hosts 编辑、零手动证书安装，同时两个用户拥有不同 hostname/origin。优先验证 platform.localhost 与每域 localhost 子域在目标浏览器的行为；不能仅依赖端口隔离 Cookie，也不使用第三方公网通配 DNS 作为唯一前提。

CLI 生成短时、一次性 bootstrap 凭据，打开可信的本机入口；入口建立 HttpOnly、host-only 会话，交换后清除导航中的临时凭据。不在未经 bootstrap 授权的接口开放任意身份选择。跳转 origin 来自服务端映射，不能接受任意 redirect 参数。URL 泄露、重放、跨站表单、DNS rebinding、WS Origin 与登出撤销纳入验证。

平台体验入口与用户原生 Host 分离；用户 Host 不持有签发其他用户登录或管理 runtime 的能力。两套演示会话不共享原生 Cookie。若 loopback HTTP 方案不能跨目标浏览器可靠闭合，必须先确定替代方案，不能以要求用户手动信任证书作为默认完成标准。

### Desktop transport 技术验证

首个验证任务同时覆盖 Linux Docker Engine 与 macOS Docker Desktop；Windows Docker Desktop/WSL2 单列矩阵，未通过前标为待支持。arm64 原生依赖和镜像必须实机或适当 runner 验证，不能只生成 manifest。

候选方向：保留 Linux Unix transport；为 Desktop 引入平台可验证的本机 TCP relay/命名卷桥接，或让平台与 worker 在 Docker 内通过受限通道通信。每条路线验证 DSH 内层凭据不暴露、未认证直连失败、其他域不能越过入口、ready identity 与 generation、失效与停止清理。不能简单给原生 DSH 发布端口后绕过 ingress。

技术验证结束再决定是否统一 transport，避免先承诺“npx 在所有 OS 都能运行”。Linux-only 可作为内部纵向切片，不能用它完成面向一般开发者的最终验收。

### 镜像与版本资产

优先 GHCR 公共镜像，与现有 GitHub CI/release 衔接；Docker Hub 可作为镜像来源，但不要求用户创建 registry 账号。命名与 namespace 权限在实施时确认，文档不写不存在的镜像为可用资源。

构建 amd64/arm64 镜像，锁定 Node 基础镜像与 npm graph，附版本/源码元信息；每次发布记录 CLI 版本 → DSH 版本 → profile 版本 → 各平台 image digest。latest 不用于运行时隐式升级。重建含系统更新的镜像产生新身份，不覆写既有发布映射。

演示 profile/模型作为明确的体验资产，与用户模型配置区分；可在同一镜像提供但不默认注入真实工作 profile。镜像不含真实 token、测试报告和平台管理凭据。

发布顺序：构建候选 → 匿名拉取和真实 CLI 验收 → 固定可用 digest → 发布 npm → 注册表安装复验。分发失败不能发布一个引用缺失镜像的启动器。镜像访问慢/失败须可诊断；镜像大小与地域下载耗时先测量，不承诺全球固定首启时间。

### 持久化与升级

数据放平台适合的用户私有持久目录，与 npm/npx 临时缓存分开；路径方案兼顾 Unix socket 长度。缓存、用户数据和诊断日志分开。状态记录 backend、镜像、profile 与数据版本。

重启使用原来用户数据；下载失败不破坏旧状态；已有域不因执行 latest 命令自动用不兼容 DSH 打开。升级先校验并显式处理必要迁移；不宣称跨 DSH 日志版本回滚无损。异常停止保留 coordinator 既有 owner/recovery 契约。

## 工作包与完成条件

| 工作包 | 可评审交付 | 通过条件 |
| --- | --- | --- |
| A：体验契约与关键验证 | localhost 双身份 + Desktop transport + arm64 验证记录 | 无 hosts/证书手工操作，原生页面和 WS 正常，跨域/直连拒绝，完成清理 |
| B：镜像分发 | 镜像构建发布流程、固定版本 manifest | 全新环境匿名拉取可用，不需要 Docker build；不含秘密 |
| C：CLI 纵向链路 | npm bin、自动目录/profile、预检、启动、浏览器、关闭 | 独立 npm 安装消费者一条命令进入真实原生 Web |
| D：首次体验 | Alice/Bob、本域样例、明确演示模型、真实模型接入路径 | 无 key 可执行三项示例；切换身份可看出差异；真实模型配置不跨域 |
| E：恢复与发行 | status/stop/doctor、保留数据、错误交互、双语 README | 冷/热启动、故障重试、重启历史、撤销和退出都通过黑盒验收 |

A 先降低未知风险；B/C 可随后按确定的 transport 实施。首期不做账号管理平台、计费、跨机调度、团队共享或自建聊天 UI。

## 黑盒验收与指标

在没有源码、pnpm、DSH、镜像缓存、profile 的干净消费者中，从拟发布 npm 包执行首页命令。只预装公开声明的 Node/npm 与 Docker。

- 一条启动命令；首次免注册、免 API key、免手写配置，不构建镜像。
- 原生 Web 可交互，演示模型明确标识；不是只有 smoke passed。
- 停止后重开保留历史和文件；重复启动不双 writer；失败后有单一明确修复动作。
- 冷下载、已有镜像的冷启动、Host 已就绪重开分别计时；记录下载字节、峰值内存、各平台分位数，避免混为一个速度指标。
- 初步性能预算（待固定硬件与网络后验证）：已有镜像到可用页面 ≤30 秒；已运行实例重新打开 ≤5 秒。未达到时先展示瓶颈，不宣传已达标。
- 无 Docker、Docker 未启动、端口冲突、下载中断、长/空格/中文路径、磁盘不足、陈旧配置、浏览器不可打开、Ctrl-C 拉取/启动中断、进程崩溃均有测试。
- 验证两个 Principal 的数据和连接隔离、域内执行无法接触平台控制面、原生 Cookie 不外泄；不能因为叫 demo 就暗示不存在的隔离保证。
- CI 除现有 SDK 测试外，增加真正 npm CLI 的消费者验收。原生 Linux、Desktop 与 CPU 架构支持声明必须与实际验证矩阵一致。

## 资料依据

- 本项目：src/runtime/providers/docker.ts、local-process.ts、ingress/server.ts、runtime/Dockerfile、scripts/native-host-probe/isolated.mjs。
- npm exec/npx 安装与 bin 执行：[npm 文档](https://docs.npmjs.com/cli/npm-exec/)。
- 公共 GHCR 支持匿名拉取、digest 引用：[GitHub 文档](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)。
- bind mount 以 daemon 主机为准、Desktop 通过 VM 文件共享：[Docker 文档](https://docs.docker.com/engine/storage/bind-mounts/)。
- Desktop 网络拓扑：[Docker 文档](https://docs.docker.com/desktop/features/networking/)。

## 实施进度（Issue #78）

工作分支 `gs-codex/one-command-experience`，所有实现与证据归入一个 PR。当前已实现 npm CLI、本机单次登录与双域 origin、默认 profile/演示模型、named-volume Docker provider、受认证 TCP relay、持久化和安装产物验证。保留 SDK API，未发布、不自动合并。

Desktop 方案采用 daemon-owned named volumes 与只绑定 host loopback 的认证 relay；所有原生路径（含 token exchange）在转发前验证内层 Cookie。无需共享宿主 Unix socket。Linux 本机验收与真实 Desktop 实机验收分别记录，不能互相替代。后者目前没有可用实机证据。

运行镜像发布加入 native amd64/arm64 runner 与匿名拉取门禁；首次 GHCR package 需管理员设为 public。源代码 manifest 保持 null，只有手动发布流水线将已验证 digest 写入 npm 产物。不会向用户承诺尚未发布的命令已经可从 registry 获取。
