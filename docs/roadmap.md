# 企业持久 AI 工作环境路线图

目标人群与取舍见[企业定位](design/enterprise-positioning.zh-CN.md)：一般不超过 5 万成员、最多 5000 在线，低配置成本与数据保障优先，允许秒级启动。规模与恢复是待验收目标。

当前主线 [#104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104)。唯一产品后端为 Kubernetes；以一个用户工作环境聚合计算、存储和访问资源。设计裁决见 [AgentEnvironment](design/agent-environment.zh-CN.md)，共同原则见[宪法](../CONSTITUTION.md)。

## 保留技术切片，增加企业交付

| 切片 | 边界 | 主记录 |
| --- | --- | --- |
| W1 删除与统一 | 依据已通过的 runtime [#100](https://github.com/GuoMonth/dsh-isolated-runtime/issues/100)采用上游core Sandbox/Pod，删除自有Cell CRD/Operator/STS控制路径；AgentEnvironment统一产品词汇；删除Process/Docker产品后端、standalone第二认证链、snapshot/restore活跃代码及对应导出/打包/门禁；不套同义CRD，不提前重命名可能删除的自有Kind | runtime [#97](https://github.com/GuoMonth/dsh-isolated-runtime/issues/97)，平台 [#105](https://github.com/GuoMonth/dsh-multi-tenant/issues/105) |
| W2 显式启停 | AgentEnvironment/PVC身份不变、Pod运行或停止；后台任务停止语义、原卷校验、并发、错误诊断和访问撤销 | runtime [#98](https://github.com/GuoMonth/dsh-isolated-runtime/issues/98)，两仓库协同 |
| W3 工具与联合内测发行 | 持久HOME和真实MCP/CLI授权；两用户回归；性能/资源测量；公开镜像及配套npm/DSH，第二操作者安装 | 平台 [#106](https://github.com/GuoMonth/dsh-multi-tenant/issues/106) |

上游有限接入已通过，正式采用目标已确定；[本地证据](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/docs/evidence/agent-sandbox-local-2026-09-23.md)不代表生产W1/W2/W3已完成。W1两侧可并行删旧路径；runtime提供精确候选，平台固定消费，再执行W2/W3。每片提供源码/产物证据；文档完成不等于代码删除、休眠实现或发行完成。边界测试随相应风险执行，集中联合回归在组合就绪后进行，不重复旧后端矩阵。

Pod内子进程、OCI镜像构建和kind底座继续可用。热池、自动idle、内存恢复、多集群、其他后端和任意工具兼容暂缓；不自研调度器、备份引擎或通用安装平台。

企业交付补充三项：[#111](https://github.com/GuoMonth/dsh-multi-tenant/issues/111) 一套安装路径/按需开通，[#112](https://github.com/GuoMonth/dsh-multi-tenant/issues/112) 数据恢复/受控升级，[#113](https://github.com/GuoMonth/dsh-multi-tenant/issues/113) 容量/过载验证。设计可与W1并行，联合验收依赖真实候选。W3仅完成有限Alpha；企业主线需补充门槛验收后才能关闭，不把Alpha直接标为5000在线企业版本。旧Issue保留并修订，不重新开一套相同任务。

## 已完成基线与未发布事实

旧P1/P2/P3分别由 [#82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82)、[#99](https://github.com/GuoMonth/dsh-multi-tenant/issues/99)、[#100](https://github.com/GuoMonth/dsh-multi-tenant/issues/100)记录。固定模板Cell候选完成[本地内测](evidence/cell-mvp-2026-09-22.md)，没有自动idle/停止启动或新工具授权验收，也没有第二位独立操作者的公开安装证据。

2026-09-22核对：已公开组合仍为平台 `0.9.0-alpha.1` + runtime `0.3.0-alpha.1` + DSH `0.1.5-rc.2`；旧版人工profile校准要求仍然有效。较新的Cell固定模板候选使用[候选指南](reference/cell-mvp-v1-candidate.zh-CN.md)，未发布。新AgentEnvironment设计更不能改写它们的发行事实。

W3承担下一版联合发行与公开安装验收，避免“所有Issue已关闭但发行仍未完成”的缺口。旧Issue保留原完成/取消状态，不拿历史snapshot或旧后端完成记录宣称新范围已验收。
