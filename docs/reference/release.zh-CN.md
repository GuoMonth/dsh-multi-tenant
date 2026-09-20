# Cell Alpha 发布

当前平台版本为 `dsh-multi-tenant@0.9.0-alpha.1`，npm 使用 `latest`，GitHub 使用普通 **Release / Latest**。Alpha 状态直接写在版本名中，不勾选 GitHub Pre-release。允许破坏性迭代，不承诺历史兼容、升级或恢复。

## 双仓库边界

运行时发布固定 Cell/Operator 公开镜像和 `release.json`；平台发布 npm 包，负责 OIDC、用户协议和接入，并绑定运行时清单。当前运行时为 `v0.3.0-alpha.1`，DSH 精确版本为 `0.1.5-rc.2`。镜像使用公开 digest，源码身份见 `packages/multi-tenant/cell-release.json`。运行时旧 standalone npm 不属于这套 Cell 安装入口。

## 发布流程

1. 核对当前组合、相关回归证据并执行 `pnpm release:check`。
2. 先发布已验收运行时镜像，核对匿名拉取及运行时 Release 清单。
3. 在已授权的 main 提交上触发 **Actions → Publish package**，输入运行时 release tag、Cell 和 Operator 的精确公开 digest。平台流水线不重新构建运行时镜像。
4. 流水线验证绑定关系，打包并检查安装产物，通过 npm Trusted Publishing 发布到 `latest`，核对公开版本、标签和完整性，然后创建同 tag 的 GitHub Release 并设为 Latest。版本名含 alpha 也遵循此规则。
5. 核对 GitHub Latest 和 npm latest；在已配置 K8s、OIDC、DNS/TLS、存储的环境安装实际公开包，记录组合及结果到 Issue #82。入口为 `npx dsh-multi-tenant@latest start --config /private/config.json`，需要 Node 24+ 以及 K8s API/Pod 网络可达。

## 发布失败

npm 版本不可覆盖。已上传版本重跑时跳过上传，继续验证原始 tarball 和通道。npm 异步可见性采用有界只读等待；不能因暂时不可见重复发包。已有 Git tag 必须指向原发布提交，错误产物需新版本。完整维护步骤见 [英文发布手册](release.md)；旧版独立运行时流程仅为 [历史资料](../archive/v0.8/docs/reference/release.md)。
