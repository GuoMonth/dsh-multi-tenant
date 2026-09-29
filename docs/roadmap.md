# 开源 Alpha MVP 路线图

当前目标：固定 DSH `0.2.0-rc.2`，单 PVC、原生 DSH、企业 OIDC、正常启停与简单安装。允许破坏性变更，不维护历史兼容或迁移。范围见 [定位](design/enterprise-positioning.zh-CN.md)，任务入口为 [#104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104)，具体分工与验收门见 [执行计划](plans/mvp-rc2.zh-CN.md)。

| 波次 | 工作 | 放行条件 |
| --- | --- | --- |
| A：单负责人 | RC 兼容薄层、固定目录与跨仓库契约 | 真实 RC 最小链路通过，双方契约/制品候选固定 |
| B/C/D：最多三路 | runtime W1/W2；平台接入；安装路径 | 按文件所有权独立交付，各自测试通过 |
| E：单负责人收口 | 固定组合、两用户与真实工具、安装、文档和发行准备 | 联合证据通过，发布制品待授权发布 |

沿用 runtime #97/#98、平台 #105/#106/#111；不新建重复需求 Issue。#112 数据恢复/升级与 #113 企业规模是后续增强，不阻塞 MVP。W3 与 #111 共用第二操作者安装证据。既有 PR 只承载准备文档，不代表实现完成。

## 已完成基线与未发布事实

旧P1/P2/P3分别由 [#82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82)、[#99](https://github.com/GuoMonth/dsh-multi-tenant/issues/99)、[#100](https://github.com/GuoMonth/dsh-multi-tenant/issues/100)记录。固定模板Cell候选完成[本地内测](evidence/cell-mvp-2026-09-22.md)，没有自动idle/停止启动或新工具授权验收，也没有第二位独立操作者的公开安装证据。

2026-09-22核对：已公开组合仍为平台 `0.9.0-alpha.1` + runtime `0.3.0-alpha.1` + DSH `0.1.5-rc.2`；旧版人工profile校准要求仍然有效。较新的Cell固定模板候选使用[候选指南](reference/cell-mvp-v1-candidate.zh-CN.md)，未发布。新AgentEnvironment设计更不能改写它们的发行事实。

W3承担下一版联合发行与公开安装验收，避免“所有Issue已关闭但发行仍未完成”的缺口。旧Issue保留原完成/取消状态，不拿历史snapshot或旧后端完成记录宣称新范围已验收。
