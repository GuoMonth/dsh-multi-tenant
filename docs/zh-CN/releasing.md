# 发布 DSH multi-tenant

[English](../en/releasing.md) · [文档目录](index.md)

平台 npm 包和 GitHub Release 共用版本及轻量 `vVERSION` 标签；runtime 使用自己的版本，双方发行相互链接。获得发布授权后，发布已在本地验收的制品。RC/beta 使用 npm `next`，alpha 使用 `alpha`，正式版使用 `latest`。GitHub 预发布使用 `--prerelease --latest=false`，保留默认安装和最新发行入口。

1. 更新平台版本、[dsh-target.mjs](../../scripts/dsh-target.mjs) 中的 DSH 针，以及[发行说明](release-notes.md)。运行 `pnpm release:check`；配套 runtime 运行 `make verify`、`make verify-dsh`。本候选配对 runtime 0.5.0-rc.3，且必须嵌入同一个 DSH 针。
2. 合并审核通过的源码，在两仓库 main 上运行手动 `prepare-release.yml`。流程在打包和推送精确候选前重跑完整的 `pnpm release:check`；PR CI 保持轻量，本地第 1 步仍是主要验收记录。下载精确候选：镜像 digest/源码信息及平台 npm 归档。
3. 验证包完整性和匿名镜像拉取。用该组合验证安装、双用户访问、真实模型/工具、数据保留和相关失败场景，保存脱敏报告。
4. 在受测源码提交上发布 [runtime 版本](https://github.com/GuoMonth/dsh-isolated-runtime)，附上清单与验证报告。
5. 在已准备的平台提交上运行 `release.yml`，提供 `platform_run`、`runtime_run`、`package_integrity`、`workload_digest`、`runtime_tag` 输入。流程发布受测归档，核对 registry 字节，创建对应标签及附带归档、清单、校验和的 Release。流程核对并自动附带 runtime 的 validation.md。
6. 核对双方 Release、相互链接、精确版本包安装和公开镜像拉取。将源码提交、镜像 digest、包完整性记录到验收 Issue。

## 显式提升 npm latest

发行负责人授权本版本作为 npm 默认安装版本时，在 `release.yml` 设置 `promote_latest=true`。正常发布先核对 npm `next`（或该版本的常规渠道）、源码身份、registry 字节和双方 GitHub Release；独立步骤再次核对已发布包的 SHA512/SHA256 与源码，再将同一版本提升到 `latest`，保留原渠道，已完成的提升直接跳过。GitHub RC Release 仍保留预发布状态。

该步骤使用 npm 11.21.0 和现有 Trusted Publisher 的 `Allow npm dist-tag` 权限；必要时为已配置的 `release.yml` publisher 启用该权限，不需要长期 npm token。提升失败不会修改已发布版本，可在相同源码和候选上恢复。

## 验证不可变候选

runtime 的 Go 二进制或原生 SDK 闭包变化时，需要新的 GHCR 工作负载镜像；平台捆绑的 SDK/Connector 变化时，需要新的 npm 包。已退役的 runtime npm 安装器不在本次发布路径内。

先合并发布准备改动，再冻结最终产品源码。记录两个成功的 main 准备任务 ID、源码提交、镜像摘要、npm integrity 和 Connector 来源。发布器要求平台准备源码与发布工作流源码完全一致；验收后 main 前进，就需要重新准备平台候选并联合验收。未变化的 runtime 候选可以保留，但必须使用其独立且已核验的来源身份。

准备工作流提供独立、只读权限的 Kubernetes 验收任务：

```sh
gh workflow run prepare-release.yml --repo GuoMonth/dsh-multi-tenant --ref main \
  -f qualify=true -f platform_run=PLATFORM_RUN -f runtime_run=RUNTIME_RUN
```

该任务下载不可变候选，在原生 Linux/amd64 上建立一次性 kind 集群，使用 Calico、动态存储、真实 Dex/Traefik 和产品 CLI 安装器。覆盖双用户、原生 HTTP/WebSocket、成员撤权、持久化、Pod 重建、UID 不匹配、网络策略、未知结果、真实 watch 缓存过期及卷缺失/替换。测试工具按校验和固定，Playwright 1.58.2 使用 Ubuntu 24.04 runner。精确输入与范围见 [integration/e2e](../../integration/e2e/README.md)。本机 ARM Docker 检查是补充证据；RuntimeDefault seccomp 不可用的仿真环境不能完成 Kubernetes 部署验收。

`release-qualification` 制品区分验收 harness 源码和产品源码，包含筛查后的报告、候选身份、发布输入草稿及 SHA256SUMS。生成的密码、密钥、浏览器 Cookie 和原始日志保存在私有区域；失败时也清理集群。失败尝试保留为证据，不能换一个源码身份后直接标为通过。

技术验收始终报告 `releaseReady=false`，直到真实模型与明确授权的 CLI 检查也具备证据。专用测试凭据通过私有文件或已批准的 Secret 存储提供，不放进源码、命令参数，也不借用平台控制凭据。模型回合后核实原生文件、会话和凭据保留，并确认另一个用户的域保持隔离。

发布前按已接受组合准备 runtime-release.json、脱敏 validation.md 和校验和。报告必须标明两个产品源码提交、平台/工作负载镜像精确摘要、包的 SHA512 integrity、Connector 来源及验收任务，并区分已通过、失败和未测要求。将同一份报告及清单附到 runtime Release，再通过 release.yml 发布已验收的平台归档。RC 发布使用 npm next，保留默认 latest 渠道。

GitHub Actions 使用 Node 24/npm >=11.5.1、`id-token: write`、`release.yml` 和 `npm-release` 环境，与配置的 Trusted Publisher 一致。构建生成的文档链接指向源码提交。

部分成功后重跑同一候选；脚本会先检查已有 npm 包完整性。已发布版本和标签保持原样。元数据可能晚于发布可见，脚本最多轮询 15 分钟；超时后核对 registry 可见性，再继续同一流程。
