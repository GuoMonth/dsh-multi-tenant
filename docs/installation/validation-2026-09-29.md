# D 安装候选离线验证

范围：[平台 #111](https://github.com/GuoMonth/dsh-multi-tenant/issues/111)，
[PR #117](https://github.com/GuoMonth/dsh-multi-tenant/pull/117)，分支 `mvp-d-install`。
只修改 `charts/`、`integration/installation/`、`docs/installation/`；不修改 C 的平台入口/包锁，
不修改 B runtime，不写集群。协调者审查和合并，E 在 G2 后执行真实安装。

## 固定输入

- 平台开发基线 `5e9e16c`，安装实现提交 `ab2f511`、`6e2cae0`；本报告随最终来源 pin 提交。
- B RBAC 来源 commit `29530cbd2fec4da4b457efd8dfec64e239e7313d`，
  `config/runtime/cluster-role.yaml`；以 `git show <commit>:<path>` 导出，`cmp` 与安装副本相同。
  SHA256 `ccc79877cbca2e48da39b51252ee7de1e9157aa17641990acdc1fe6aae843723`。
- 上游 core v1.0.3 原始 SHA256 `725fafdabe6aac202a89dc57f1cfe0e2e92f3164c8c2bd343fffca52f7039d96`。
  固定 controller digest 后 SHA256 `e071569ce050ebcad0cafb00a7a04233883e375f2f0e86f55a7e24a2b34544e2`，
  检查仅替换 controller image，没有改 upstream CRD/RBAC/controller 实现。
- DSH `0.2.0-rc.2` / `639ed015397290b3745d163aafe02ffee4aa3f84`。
- C 通过协调通道确认七字段配置、UID1000、8080、`GET /healthz`、
  `start --config`、0600 Secret 和0700 state/admin 目录；chart 消费该接口。
  C 的真实平台包/镜像与 B workload 最终 digest 由 E 固定，不使用本报告的 fixture 冒充。

## 实际检查

环境 Node 24，Helm `v3.21.3+g1ad6e68`。命令均为离线检查，没有模拟 Kubernetes 成功响应。

```sh
node --test integration/installation/verify.test.mjs
helm lint charts/dsh-platform --values integration/installation/fixture.values.json --strict
node charts/install.mjs render --values integration/installation/fixture.values.json --namespace dsh-install-fixture
git diff --check
```

6 项 Node 测试通过，Helm lint 0 failures；渲染输出7个平台对象且可以作为 JSON/YAML 解析：
平台 ServiceAccount、ClusterRoleBinding、ConfigMap、Deployment、Service、Ingress、控制 PVC。
core 与 B runtime role 由同一入口使用校验文件安装；chart 不含用户 namespace/Sandbox/用户卷。

验证覆盖：单副本/Recreate、PVC keep、平台标签/绑定、七字段配置、Secret 引用、
UID1000、私有0600/0700准备、临时 admin socket、平台和通配用户入口、默认 CPU/Memory/单卷容量。
反例覆盖缺域名/镜像/TLS/StorageClass/member、浮动镜像、旧 environments/modelSecret 字段、
错误 member issuer、namespacePrefix 24/25 边界、合法 CPU `0.5` 与错误 CPU `1Gi`。
fixture 的实际 live-install 调用在 Kubernetes 前拒绝，不会创建任何资源。

## 未覆盖与交接

没有运行在线 preflight/install 分支：Secret读取、TLS密钥比对、DNS/OIDC discovery、
core apply/等待、Helm真实安装均须 E 在其独占集群阶段验证。没有真实候选镜像部署、
平台初启、用户 Pod 供应、Ingress HTTP/WS、实际 Secret/PVC权限、两用户OIDC、真实模型或工具授权证据。
以上属于 #106/#111 的联合验收，不因离线检查通过而关闭。

入口使用明确 kubeconfig/context，拒绝 fixture、已有控制 PVC/平台绑定；K8s1.37 是参考验证版本，
不把其他未验证 minor 作为无依据的安装硬门槛。
未发布公网候选时仅消费 E 已导入的本地镜像。安装失败保留现场，卸载保留用户卷和平台控制 PVC；
不承诺自动恢复、升级、备份或HA。没有 npm publish、推公网产品镜像、创建Release或自行merge。

E 按 [安装草稿](README.zh-CN.md) 配置现有 OIDC/DNS/TLS/CNI/存储和私有 values，
先 preflight 再 install，然后记录真实双方commit/包integrity/三镜像digest及双用户验收。
最终根README/package README/AI链接由 C/E 所有者对齐，本分支不越权修改。
