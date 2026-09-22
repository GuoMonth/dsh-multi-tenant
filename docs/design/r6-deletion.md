# R6 管理删除与集中回归

当前已实现精确身份删除、持久化删除屏障与按环境撤权；固定组合的真实集群回归覆盖精确删除、响应丢失及 Retain/Delete PVC 处置。writer 停止证明和数据销毁边界仍有限，具体证据见[回归报告](../evidence/cell-regression-2026-09-20.md)。以下记录实现语义，不构成额外安全/恢复认证。

## 私有管理员入口

配置新增必填 `adminSocket`，例如 `/private/platform/admin.sock`。其父目录需预先
创建，由当前平台账号拥有且权限 0700；socket 权限 0600。目录和状态文件位于
所有 Cell 存储之外。已有 socket 路径会导致启动失败，不自动删除或接管旧文件。
管理端口不绑定 TCP，不经 Gateway 暴露，不使用普通 OIDC 成员身份。

从可访问私有 socket 的平台主机执行（替换实际路径、环境 ID 及查询结果）：

```sh
dsh-multi-tenant inspect --socket /private/platform/admin.sock --environment alice
dsh-multi-tenant delete --socket /private/platform/admin.sock --environment alice \
  --allocation-key ALLOCATION_KEY --identity IDENTITY
```

delete 的三个目标字段必须匹配持久绑定。该命令是显式删除请求，会按照已固定
模板影响 Cell 和其 owned 资源；先检查数据保留策略。普通网页/API 没有 DELETE
权限。拥有平台操作系统账号及私有 socket 访问权即拥有管理员能力，不新增角色后台。

inspect 返回原分配的当前事实；reserved 状态尚无实例时返回保留的 key。
处于创建在途或 submitted 状态不能删除，必须先查询并确认原 identity。
已提交删除后，再次调用 delete 只查询原实例，绝不再发送 DELETE。

执行管理删除前，平台 Kubernetes 账号需在目标 namespace 增加 Cell `delete`
权限；不授予 Pod/PVC/Secret 删除或 patch 权限。先核对 RBAC，明确拒绝也会
保持本地删除屏障关闭。

## 持久状态与撤权

SQLite 状态版本改为 **6**。不迁移/覆盖旧版本文件；旧文件和原 Cell 需要明确
保留与管理员处置，不能通过删除台账或重建数据库来重放旧分配。

在 reserved → submitted → bound 之外，只增加当前分配的 `delete-requested`
以及 `deleteEffect`（unknown / accepted / not-submitted）。这不是 Pod 生命周期
或永久 tombstone；当前行及原 identity 保留，没有自动清空/重建/reset API。

删除与创建/查询共用分配互斥。删除前先持久化 unknown 屏障，然后同步移除环境
访问路由并撤销所有浏览器的该环境子会话，使已有 HTTP/WS/stream abort；父平台
会话仍可查询结果。即使本地提交失败也先关闭该环境访问，且不发送删除请求。

runtime 返回明确结果后仅更新 deleteEffect，绝不退回 bound。重启、失败或响应
未知都保持访问关闭，只查询原目标。查询成功也不会重新发布 origin。父会话仍可
登出，其他环境不受此次环境撤权影响。撤权关闭连接不等于停止 DSH 后台任务。

runtime 重新验证 Cell identity/归属/模板，使用 UID + resourceVersion 条件 DELETE。
删除不依赖 Ready，所以 Pending/Unavailable 的已绑定环境也能显式处置。
字段漂移或条件冲突拒绝，不重发无条件 DELETE。不设置强制停止或 grace=0。

`accepted`、`Deleting`、`Missing` 不能证明 writer 已停止；runtime 返回明确的
`writerState: unverified`。管理命令 HTTP 200 表示已返回观察/请求结果，不表示
资源或数据已回收。查询失败保留结构化诊断，404 不允许重建或复用旧卷。

## 数据边界

实际实现维护于 runtime `docs/design/r6-deletion.md`：

| 对象 | 当前处置 |
| --- | --- |
| data PVC，Retain | 无 Cell controller owner，保留；不承诺自动复用/恢复 |
| data PVC，Delete | Cell owner 触发 Kubernetes 回收流程；非物理销毁或停止证明 |
| private PVC | Cell-owned，随回收流程处理；不因 data Retain 而统称全部保留 |
| 外部 provider Secret | 管理员提供的引用，不由此入口删除 |

不新增 purge、强删、旧卷复用、fencing、HA、升级或恢复服务。无法核实 writer 停止
时保留人工核验边界，不假报清理成功。本文和代码提交不是实际数据销毁授权。

## 有限回归与证据

`npm test --prefix integration/cell-platform` 使用真实临时 SQLite、真实 Sessions、
本地 Unix socket 和受控 runtime 替身，覆盖：

- 创建响应未知后的 submitted 持久化，重启和重复 POST 不重放。
- 删除屏障/子会话 abort 早于 runtime 写入，未知响应后重启仍只查询。
- 错身份和在途查询阻止删除；已接受删除不恢复访问或重建。
- 数据库独占与 identity 不可变；公共 DELETE 拒绝，私有入口要求精确目标。

Runtime 的本地 TLS API 用例覆盖真实 DELETE 编码、UID/resourceVersion 条件、
Pending 删除、冲突/替换/缺失/中断和重复请求边界。上述结果不能替代真实 API/GC。

当前固定版本已通过核心集群/浏览器/真实模型回归，详见 [回归报告](../evidence/cell-regression-2026-09-20.md)。真实 API 已覆盖精确删除、响应丢失、旧 UID、Retain/Delete/private PVC；外部 credentialsRef Secret 删除场景未额外集群实测。平台未知/并发屏障属于 SQLite + runtime 替身证据，不混称完整集群崩溃矩阵。主 Issue #82 保持开放；公开包安装入口见 [启动指南](../reference/quickstart.md)。
