[English](./DIRECTION.md) | 简体中文

# Direction

`0.3` 是当前产品基线。项目不再维护长篇 Milestone Roadmap，也不会因为某个 prerelease 历史曾经存在，就继续把它留在 live tree 里。

## 当前基线

现在项目只讲一条产品故事：

```text
可信产品用户
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> 安全 create/resume
  -> Principal-owned DSH Agent
  -> 官方 MCP client
  -> native MCP Tools
```

眼前目标就是发布并真实使用 `0.3.0-rc.1`，从真实 integration 获取反馈，同时保持仓库足够小、足够容易做 breaking change。

## 下一步是证据，不是下一个 Milestone

下一个架构决策应该由第二个真实 integration（例如 ERP）推动，而不是再画一条 speculative Roadmap。

真正需要回答的问题是：MCP 与第二个 integration 是否反复出现相同的 authority / refresh / injection / audit 语义，从而值得把当前 low-level credential primitive 提炼成可复用的 Broker / authority plugin contract。

```text
真实 MCP integration       ✅
        ↓
第二个真实 integration
        ↓
比较重复语义
        ↓
只提炼被真实证据证明的 abstraction
        ↓
必要时允许 prerelease breaking change
```

## 长期原则

> **Core 管身份和生命周期；Broker 管授权与 secret；Integration 管厂商协议；Operation 消费 typed ability；Secret 在可行时留在 authority boundary 后面。**

详见 [`docs/vision/authority-capabilities.zh-CN.md`](./docs/vision/authority-capabilities.zh-CN.md)。
