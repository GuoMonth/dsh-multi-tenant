[English](./product-ingress-credentials.md) | 简体中文

# Spec — Product Ingress 与 Principal Credentials

> 状态：已经实现的 `0.3` contract。

## Product Ingress 边界

Authentication 在框架信任 identity 之前完成。Cookie、JWT/OAuth/OIDC/SAML、service credential、queue metadata 等协议细节都属于产品层。

Core 从一个已经可信的 subject 开始：

```text
trusted product subject
  -> ProductIdentityResolver
  -> validate TenantPrincipal
  -> bound RuntimeComposition.principal()
  -> ComposedPrincipal
```

`createProductIngress()` 不保存厂商认证状态，也不负责解析 token。Resolver 产出的 identity 无效时，会在 canonical Runtime selection 之前失败。

## Principal Credentials

`principalCredentials` 是当前 Principal-scoped credential capability：

```text
CapabilityToken<PrincipalCredentials, 'principal'>
```

最小 contract 有意保持很小：

```ts
interface PrincipalCredentials {
  get(name: string): Promise<string | undefined>
  require(name: string): Promise<string>
}
```

它不提供 secret 枚举、序列化或万能 secret-store API。

这是一个**当前 `0.3` 的 low-level primitive**，不是长期鼓励 Agent / application 直接拿 raw credential 的承诺。当前 MCP integration 会在可信 Agent setup plumbing 内解析 credential binding。未来如果真实 evidence 支持，可以把 credential access 放到 authority / Broker plugin 后面，并向 Operation 暴露 service-specific typed client / transport。

详见 `../vision/authority-capabilities.zh-CN.md`。

## Provider adapter

`definePrincipalCredentialsProvider()` 在 Principal setup 中接收已经解析的 Principal 与 AbortSignal。Provider 可以从任意实现加载 credential；Core 只要求 capability 在正确的 Principal scope materialize。

`InMemoryPrincipalCredentials` 仅用于 reference / test，不是 production secret store。

## Required evidence

Contract tests 覆盖 trusted subject mapping、malformed identity rejection、sibling / cross-Tenant credential isolation、Tenant parent 不泄漏、missing credential、provider replacement，以及 RuntimeComposition dispose 后的干净 recreation。

## Security boundary

这里的 credential isolation 是 trusted same-process Cordis scope isolation。拥有任意同进程 / process / filesystem 权限的恶意代码不在保证范围内；strong isolation 仍属于 deployment boundary。
