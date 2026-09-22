# Cell POC roadmap

一条路线：受控成员通过 OIDC 进入自己的普通 Pod，使用原生 DSH。当前进度与验收的唯一主记录是 [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82)；本页维护顺序和责任，不复制每次执行日志。

## 三个切片

| 切片 | 交付边界 | 负责人 / 记录 |
| --- | --- | --- |
| P1 收窄范围 | 普通 Pod，移除可选 sandbox RuntimeClass；历史 standalone/快照/恢复退出当前入口和门禁。源码合并与发行分开核对 | runtime [PR93](https://github.com/GuoMonth/dsh-isolated-runtime/pull/93)；共同原则见[宪法](../CONSTITUTION.md) |
| P2 简化部署 | runtime维护固定模板，平台消费；不再要求校准Cell和手写完整Pod spec | 跨仓库 [Issue #99](https://github.com/GuoMonth/dsh-multi-tenant/issues/99) |
| P3 独立验收 | 从干净安装环境按短指南完成双用户、真实DSH任务和基本隔离检查，修复实际阻碍 | 平台统筹、runtime协作：[Issue #100](https://github.com/GuoMonth/dsh-multi-tenant/issues/100) |

P1 的代码候选、已发布 npm 和联合安装验收是不同事实，以各 PR / Issue / Release 的实际状态为准。2026-09-20 已发布组合仍为平台 `0.9.0-alpha.1` + runtime `0.3.0-alpha.1` + DSH `0.1.5-rc.2`；人工profile校准仍是这个版本的现实前提。新固定模板候选使用独立的[候选指南](reference/cell-mvp-v1-candidate.zh-CN.md)与[内测证据](evidence/cell-mvp-2026-09-22.md)，不能用它改写旧发行安装要求。

## P2 如何并行

1. runtime先定义小模板契约：输入、固定字段、允许的API默认值、UID/owner链和目标核验。平台共同核对，避免一个仓库单方面设计完整Pod配置给另一个仓库。
2. 契约明确后，runtime实现渲染/校验；平台并行准备配置收敛、vendor消费与短指南。共享模板只有一个维护来源，不建设DSL、registry服务或跨后端插件。
3. runtime实现先合并，平台再绑定确切Connector/提交/制品组合。检查重复的两轮K8s verify，只在保持发送前身份核验和撤权行为时简化。
4. 一次联合候选交给P3；不让两边各跑一套测试就分别声称端到端完成。

## POC 完成条件

另一位开发者在已提供K8s、OIDC、DNS/TLS、存储与实际执行网络策略的环境里，不借助维护者私有lab、不创建校准Cell，按文档完成：

- 两个用户登录、显式创建/查询并进入自己的Cell，使用原生HTTP/WS/Session/Tools。
- 真实模型文件写读，补一项用户态命令/子进程或依赖任务；普通Pod重建保留本版本文件/会话。
- 未认证、跨owner、绕过入口拒绝；登出关闭既有连接；实际验证约定的CNI ingress/egress。
- 少量真实socket检查覆盖连接/首部/升级失败与取消，不用统一短超时误杀模型长流。

P3记录步骤、用时、制品与失败点。通过后按发布授权交付下一Alpha；验收完成不等于已经发版。没有真实故障，不追加全攻击矩阵、长时压力或任意恢复演练。

## 不在路线内

额外sandbox/gVisor/Kata、Pod内逐命令二级隔离、通用Sandbox SDK、Process/Docker后端、standalone第二认证链、快照/恢复、HA/多集群、兼容迁移、macOS/Windows安装和通用代理平台均不构成一期任务。旧实现和证据保留在历史入口，不把它们误当当前依赖。

入口继续复用Envoy TLS/路由；平台负责openid-client OIDC与准入；runtime Connector绑定实例并转发；Cell launcher用Go标准库ReverseProxy适配DSH。没有新Nginx/Caddy/Pingora引入计划。详见[范围裁决](design/poc-focus.zh-CN.md)与[代理选型](design/proxy-choice.zh-CN.md)。

## Issue 维护

已完成的阶段Issue关闭为completed；被新范围替代的旧产品需求关闭为not planned并指向本路线。可复现bug与依赖安全维护按实际影响单独保留，不能用“不是POC核心”冒充已修复。历史发行、回归证据和已关闭Issue仍可查，不复制到当前待办。
