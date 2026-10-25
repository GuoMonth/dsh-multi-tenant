# 发布 DSH multi-tenant

[English](../en/releasing.md) · [文档目录](index.md)

平台 npm 包和 GitHub Release 共用版本及轻量 `vVERSION` 标签；runtime 使用自己的版本，双方发行相互链接。获得发布授权后，发布已在本地验收的制品。RC/beta 使用 npm `next`，alpha 使用 `alpha`，正式版使用 `latest`。GitHub 预发布使用 `--prerelease --latest=false`，保留默认安装和最新发行入口。

1. 更新包版本和[发行说明](release-notes.md)。运行 `pnpm release:check`；配套 runtime 运行 `make verify`、`make verify-dsh`。
2. 合并审核通过的源码，在两仓库 main 上运行手动 `prepare-release.yml`。流程在打包和推送精确候选前重跑完整的 `pnpm release:check`；PR CI 保持轻量，本地第 1 步仍是主要验收记录。下载精确候选：镜像 digest/源码信息及平台 npm 归档。
3. 验证包完整性和匿名镜像拉取。用该组合验证安装、双用户访问、真实模型/工具、数据保留和相关失败场景，保存脱敏报告。
4. 在受测源码提交上发布 [runtime 版本](https://github.com/GuoMonth/dsh-isolated-runtime)，附上清单与验证报告。
5. 在已准备的平台提交上运行 `release.yml`，提供 `platform_run`、`runtime_run`、`package_integrity`、`workload_digest`、`runtime_tag` 输入。流程发布受测归档，核对 registry 字节，创建对应标签及附带归档、清单、校验和的 Release。流程核对并自动附带 runtime 的 validation.md。
6. 核对双方 Release、相互链接、精确版本包安装和公开镜像拉取。将源码提交、镜像 digest、包完整性记录到验收 Issue。

GitHub Actions 使用 Node 24/npm >=11.5.1、`id-token: write`、`release.yml` 和 `npm-release` 环境，与配置的 Trusted Publisher 一致。构建生成的文档链接指向源码提交。

部分成功后重跑同一候选；脚本会先检查已有 npm 包完整性。已发布版本和标签保持原样。元数据可能晚于发布可见，脚本最多轮询 15 分钟；超时后核对 registry 可见性，再继续同一流程。
