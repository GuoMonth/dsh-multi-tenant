[English](./m4-product-ingress-credentials.md) | 简体中文

# Spec —— M4 Product Ingress / Principal Credentials

> Status：已实现的 v0.3 Core contract。

## Product Ingress Boundary

Framework 信任 identity 之前，authentication 已经由产品完成。HTTP Cookie、JWT / OAuth / OIDC / SAML、service credential、queue metadata 等 protocol mechanism 都属于产品层。

Core 从 already trusted subject 开始：

```text
trusted product subject
  -> ProductIdentityResolver
  -> validate TenantPrincipal
  -> bound RuntimeComposition.principal()
  -> ComposedPrincipal
```

`createProductIngress()` 不拥有 vendor auth state，也不解析 token。resolver 产出的 identity 非法时，在 canonical Runtime selection 之前直接失败。

## Principal Credentials

`principalCredentials` 是第一个具体 product-facing Runtime capability：

```text
CapabilityToken<PrincipalCredentials, 'principal'>
```

stable service key、semantic value type、Principal authority 由同一个 token 表达。Materialization 继续使用普通 composition provider contract 与 Cordis Principal scope。

最小 contract 刻意保持简单：

```ts
interface PrincipalCredentials {
  get(name: string): Promise<string | undefined>
  require(name: string): Promise<string>
}
```

它不提供枚举、序列化，也不假装自己是 universal secret-store API。

## Provider Adapter

`definePrincipalCredentialsProvider()` 在 Principal setup 中拿到 resolved Principal 与 AbortSignal。Conforming provider 可以从任意后端加载 secret；Core 只要求最终 `PrincipalCredentials` value 被 materialize 到正确 scope。

内置 `InMemoryPrincipalCredentials` 只用于 reference / test；production secret storage 属于后续 provider concern。

## Required Evidence

M4 contract tests 证明：

- trusted subject 映射到正确 canonical Tenant / Principal；
- malformed identity 在 Runtime selection 前失败；
- Acme/Alice、Acme/Bob、Globex/Alice 得到彼此隔离的 Principal credentials；
- credentials service 不泄漏到 Tenant parent；
- missing credential 显式失败；
- 替换 credentials provider 不需要修改 Framework Core；
- RuntimeComposition dispose 后可以 clean recreation Principal / provider lifecycle。

## Security Boundary

这里的 Credentials isolation 是 trusted same-process Cordis scope isolation。恶意同进程插件或者任意 process/filesystem access 不属于该 guarantee；strong isolation 继续属于 deployment boundary。
