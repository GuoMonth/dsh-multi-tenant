[English](./CONTRIBUTING.md) | 简体中文

# 贡献指南

本项目将独立 Principal 的原生 DSH Host 接入多用户平台。平台只负责认证、域归属、运行时生命周期和入口；Session、workspace、preset、工具、持久化与 Web 行为由原生 DSH 持有。

授权链路：

```text
可信应用登录
  -> (tenantId, principalId)
  -> 持久化域目录与可撤销准入
  -> 独立持有的 runtime generation
  -> 原生 DSH Host、数据和能力
```

Principal 内没有独立根/会话读取 ACL。原生权限继续按原生语义工作，平台管理与凭据始终位于域外。通过 `DomainAuthenticator`、`DomainRepository`、`RuntimeProvider` 扩展，避免重绑私有 scope、复制 controller 或另建一套 Agent lifecycle。

重要变更合并前：

- 准入前核对完整 tenant/principal tuple 和可信 origin；
- 撤销使已有连接失效，无法证明清理完成时保留所有权；
- 提供生命周期、并发、恶意输入及失败路径的可执行证据；
- 保持 Node 22.19 和 Node 24 发布检查通过；
- 公开入口或运行时变更使用独立 tarball 消费者和真实原生验证；
- 同步双语用户能力、边界和升级说明；
- 删除被替代实现，但保留仍需成立的行为证据。

`pnpm release:check` 不执行发布。`pnpm probe:isolated` 用安装后的包验证真实原生 Host，环境要求见探针说明。DSH 版本/源码身份由 `scripts/dsh-target.mjs` 固定，本包版本由 package manifest 持有；更新上游需要经过审查的基线变更。

发版时更新 README、CHANGELOG 和 `docs/releases/v<version>.md`，先合并经过审查的变更。手动 `release.yml` 只允许从 push CI 已通过的 main 提交运行：校验 registry 身份，发布 npm，验证安装产物与 dist-tag，最后创建同提交的 Git tag 和 GitHub Release。不得给另一提交打发布 tag，也不能把未发布的源码里程碑写成 npm 版本。
