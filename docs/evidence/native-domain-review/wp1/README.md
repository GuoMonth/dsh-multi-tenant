# WP1 原生宿主实验结果

2026-09-11，工作分支 `refactor/68-71-native-authority`。真实 DSH `0.1.5-rc.2`、容器 Node `v24.19.0`、Chrome `150.0.7871.128`。执行成功退出，10 组行为检查通过，测试资源清理无错误；机器报告见 [report.json](report.json)。

## 复现

在仓库根目录执行：

```sh
pnpm --dir scripts/native-host-probe install --frozen-lockfile
PROBE_CHROMIUM=/usr/bin/google-chrome pnpm probe:native-host
```

依赖及浏览器安装说明见[实验入口](../../../../scripts/native-host-probe/README.md)。本次原始证据目录为 `/tmp/dsh-wp1-bp96Rm`；本目录保存报告、截图和页面文本。测试只使用虚构身份与数据，不需要模型密钥。另执行 `pnpm verify` 通过现有契约、产物和发布身份检查。

## 实际证明的行为

- 两个原生 Web Host 使用各自的数据卷和原生认证，相同 Session ID、preset、MCP 名称读取各自的测试标记。
- 真实 preset 装配支持子代理、孙级、one-shot fork 和空会话切换 preset。
- 原生 toolFilter 同时隐藏受限工具 schema，并拒绝模型强制发出的工具调用；宿主重启后限制仍有效。
- 宿主真实停止、重启后可以读取冷历史并继续原生子代理。
- 原生文件读取、跨宿主 cookie 拒绝和原始二进制上传通过。
- 两个独立浏览器上下文使用官方 Web，发送消息、断网重连后再次发送、打开设置；列表分别显示所属域的会话。

截图：[Alice](alice-web.png)、[Bob](bob-web.png)。页面文字：[Alice](alice-web.txt)、[Bob](bob-web.txt)。

## 对抗性自审结论与限制

这是基于实现和反例的自审，不是独立多人审计。实验没有修改原生 scope binding、复制 continuation/controller 或替换官方业务 UI。结果支持继续按 Principal 独立宿主推进；它不是上游对多租户架构的承诺。

独立数据卷与跨 cookie 拒绝只覆盖此次功能样本。两个容器共用内部网络，不能证明网络隔离；最小 preset 不能代表全部内置 preset 或任意插件。实验从官方 CLI 登录 URL 获取测试认证材料，loopback relay 仅承担测试传输，均不能作为生产认证交接方案。

正常结束及捕获异常执行精确资源清理，报告包含清理错误；尚未进行 supervisor 故障注入，外部强制杀死 runner 也不在已验证范围。容量、根授权撤销、Principal 撤销、全部协议入口与跨域执行边界仍须 WP2–WP5 完成。此次结果不足以关闭 #68、#71 或 #65。

下一步是 WP2 域目录与 runtime 生命周期。进入 WP3 前需要以公开接口验证生产认证交接、Host/Origin 映射和连接撤销，不沿用测试脚本截取日志的方式。
