[English](./DIRECTION.md) | 简体中文

# Direction

`0.3` 是当前产品基线。项目不会维护长篇 milestone roadmap，也不会因为某个 prerelease / 调查文档“曾经存在过”就把它永久留在 live tree。

## 当前基线

现在项目只讲一条产品故事：

```text
trusted product subject
  -> canonical Tenant / Principal
  -> Tenant MCP config + Principal Credentials
  -> safe create/resume
  -> Principal-owned DSH Agent
  -> official MCP client
  -> native MCP Tools
```

短期目标不是继续补 milestone，而是把 `0.3.0-rc.1` 真正发出去、在真实项目里用起来，然后根据实际摩擦继续快速演进。

## 下一步看 Evidence，不看 Milestone 编号

下一个架构决策应该来自第二个真实 integration（例如 ERP），而不是来自下一张 speculative roadmap。

真正值得观察的问题是：authority / refresh / injection / audit 是否在多个 integration 里重复出现到足以提炼 Broker / authority plugin contract。

```text
真实 MCP integration        ✅
        ↓
第二个真实 integration
        ↓
比较重复语义
        ↓
只提炼被证明的 abstraction
        ↓
必要时直接做 prerelease breaking change
```

## Live Tree Policy

- 当前代码、当前 contract、当前 evidence 留在主树；
- 已经被替代的 milestone 名称、旧 release note、一次性 probe / workflow 删除；
- 历史价值交给 Git history / tag，不让 archaeology 增加当前维护成本；
- package / abstraction 只有在真实 vertical slice 证明独立价值后才新增。

## 长期原则

> **Core 管 identity / lifecycle；Broker 管 authority / secret；Integration 管 vendor protocol；Operation 消费 typed ability；Secret 在可行时留在 authority boundary 后面。**

详见 [`docs/vision/authority-capabilities.zh-CN.md`](./docs/vision/authority-capabilities.zh-CN.md)。
