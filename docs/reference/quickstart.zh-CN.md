# RC2 候选快速入口

当前源码仅支持 Kubernetes，固定 DSH 0.2.0-rc.2。前提、私有配置、进入/停止/启动和成员撤权见[中文 README](../../README.zh-CN.md)，示例见[候选配置](../../integration/distribution/config.example.json)。

使用 Node 24+ 安装已审查的本地平台 tarball，再执行：

```sh
dsh-multi-tenant start --config /private/config.json
```

不提供旧 Cell/Process/Docker 入口、Alpha 状态迁移或公共制品可用性承诺。安装资产由安装任务维护；真实 runtime 联合验收归 [#106](https://github.com/GuoMonth/dsh-multi-tenant/issues/106)。用户 E2E 前须固定平台、Connector、runtime 镜像的精确身份。
