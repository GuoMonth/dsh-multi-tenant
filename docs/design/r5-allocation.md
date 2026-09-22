# R5 创建、查询与分配状态

当前平台已实现 runtime Cell 创建/查询和 SQLite 分配屏障，并通过有限真实集群/浏览器回归；实际覆盖及边界见[回归报告](../evidence/cell-regression-2026-09-20.md)。本设计保留配置与状态语义，不扩大成完整故障矩阵。API-defaulted `expectedSpec` / `expectedPodSpec` 仍需管理员手动校准；Issue #99 的 P2 简化尚未实施或发布。runtime P1 sandbox 改动 PR #93 尚未合并/发布。删除入口见 [R6](r6-deletion.md)。

## 当前入口

先访问平台 origin 的 `/`，完成 OIDC 登录。首页列出可信配置分配给当前主体的
环境，提供创建/查询入口。无需预先知道 Cell UID 或环境 origin。

- `POST /api/environments/<id>`：仅首次保留状态可调用 create；其他状态只查询原分配。
- `GET /api/environments/<id>`：只查原分配，绝不创建。
- 请求必须使用平台父会话；POST 必须带平台精确 Origin。只接受无 body、无 query
  的请求。浏览器不能指定 owner、template、allocationKey、namespace 或 endpoint。
- 返回精确实例及 `Pending | Ready | Unavailable | Deleting`；只有 Ready 返回 200，
  其他已观测状态返回 202。错误保留 phase、结构化诊断及 correlationId，不返回原始
  Kubernetes 错误或凭据。202 表示返回当前事实，不承诺后台平台任务将继续推进。

查询成功后刷新平台首页可进入环境。每次原生访问仍由 runtime 重新核验实际资源，
单凭之前的 Ready 不授权连接。平台重启后重新登录并查询原环境以恢复当前访问路由；
不自动重放创建，不恢复旧浏览器会话或进行中的平台请求。

## 状态结构

平台私有 SQLite 只存环境意图和写入/绑定事实，不保存 Pod 生命周期：

| phase | 持久事实 | 后续动作 |
| --- | --- | --- |
| reserved | 随机 allocationKey、owner、template 已提交到本地数据库，尚未调用 create | 显式 POST 可提交一次 |
| submitted | 已在调用 create 前持久化提交屏障；写入可能尚未发送、已接受或结果未知 | 只 inspect 原 key，绝不自动重试 create |
| bound | 已将 runtime 返回的精确 identity 持久化 | inspect 必须匹配 identity；缺失/变更不重绑或重建 |

提交屏障采用保守语义：即使失败发生在真正写入之前，也不自动退回 reserved。
平台退出发生在本地提交之后、HTTP 发出之前时，同样只允许读。管理员核验后决定
新的分配和新的数据边界，本轮不提供 reset/retry/purge API，也不删除旧状态解困。

每个环境的管理调用在当前进程内互斥，重叠请求立即返回 AllocationUnresolved。
SQLite 使用 FULL 同步和独占锁，一个状态文件只能由一个平台进程持有。
存储写入失败后禁止继续更新状态；不向调用方假报创建成功。会话仍只在内存，
不写进 SQLite。不存在多副本协调、永久 tombstone、迁移或无感恢复。

## 破坏性配置变更

删除 R4 的 `bindings` 和 Environment `instance` 配置。R5 不导入旧预建实例；
原环境及数据不会自动清理。使用明确的新配置和私有状态文件进行本轮验证。

保留 `host`、`port`、`kubernetes`、`oidc`、`members`，新增：

```json
{
  "stateFile": "/private/platform/allocations.sqlite",
  "environments": [{
    "id": "alice",
    "owner": {"tenantId": "tenant-a", "principalId": "user-a"},
    "template": "dsh-mvp-1"
  }],
  "allocation": {
    "namespaces": {"tenant-a": "tenant-alice"},
    "domain": "cells.dsh.example.com",
    "profiles": [{
      "template": "dsh-mvp-1",
      "expectedSpec": {},
      "expectedPodSpec": {}
    }]
  }
}
```

下面是结构示意，不是可部署配置。profile 字段必须取自管理员固定部署实际 defaulted Cell/Pod 模板，不能直接照抄占位值。Cell spec 的 image 必须是 digest；不得含 allocation 或 restoreFrom。
Pod 模板字符串仅支持 runtime 定义的 `${INSTANCE_ID}`、`${ORIGIN_HOST}` 替换。
运行时配置详情见 runtime `docs/design/r5-allocation.md`。模板修订/namespace/镜像
属于受信部署配置，不能由用户提交。状态内已有环境不允许偷偷更换 owner/template
或从配置删除；格式版本不匹配立即拒绝，不清空/迁移数据库。

当前状态版本和必填 adminSocket 见 [R6](r6-deletion.md)，不自动迁移旧文件。

状态目录预先由管理员创建并限制访问，位于所有 Cell 存储之外。应用创建 0600
数据库文件；已存在文件必须私有。备份/检查此独占数据库前应停止平台进程。

安装当前 runtime CRD，使 `spec.allocation` 的不可变绑定规则生效。现有平台
RBAC 在读取权限之外增加 Cell `create`，不增加 Pod/PVC 写入、patch 或 delete。
Gateway/TLS 必须把 `cell-<UID>.<allocation.domain>` 送到平台，并保留 Host；
该 domain 应在 `oidc.siteDomain` 内。CNI 必须继续阻止绕过平台直接访问新 Cell。

## 已测内容与剩余清单

以下列表是风险检查项，不代表每项都已执行；已完成的真实集群/浏览器范围及替身测试边界见上方回归报告。

- SQLite 分配持久化、独占锁、错误格式/损坏/只读文件/磁盘满；写屏障前后退出。
- 并发同环境创建、同 key 同意图、冲突归属/模板/实际 profile；CRD 不可变字段拒绝变更。
- POST 响应丢失、取消、5xx、409、CRD 剪裁字段；unknown 后 GET 404 不触发重建。
- bound 实例缺失或 UID 改变拒绝；重启后原 identity 重新查询及登录可访问。
- Pending 与 Unavailable 不误报 Ready；defaulted 模板、实际 DSH/image/资源身份验证。
- 两主体平台 API 隔离，POST CSRF、用户伪造配置字段、撤权中途创建；取消连接不代表
  取消已提交创建，也不删除 Cell。
- 新 UID 的 HTTPS origin 路由、DSH cookie 与平台凭据过滤，以及 CNI 绕过负例。

当前固定版本已完成核心集群/浏览器回归，实际通过项与测试层级见 [回归报告](../evidence/cell-regression-2026-09-20.md)。上方是风险清单，不把磁盘满、完整崩溃矩阵等未执行项冒充已验收。
