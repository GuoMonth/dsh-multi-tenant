# 发布准备与正式发布

当前候选版本为 `dsh-multi-tenant@0.8.0`，目标 npm 通道为 `latest`，Git tag 为 `v0.8.0`。源码版本不代表已经发布；用 `npm view dsh-multi-tenant version dist-tags --json` 查询实际状态。包 manifest 是版本事实来源，`scripts/dsh-target.mjs` 固定 DSH 基线，发布说明在 `docs/releases/v0.8.0.md`。

## 准备发布 PR

```sh
pnpm install --frozen-lockfile
pnpm release:check
node scripts/registry-preflight.mjs 0.8.0
```

以上命令不执行发布。完整检查覆盖元数据、固定依赖/Actions、公开类型、测试、构建、SQLite 恢复和独立安装的 SDK tarball。同步根目录及 npm 包的双语 README、AI.md、changelog 和发布说明。源码 `runtime-manifest.json` 保持 `image: null`，只有发布工作流向产物写入经过验证的 digest。

质量验证以本地执行为准，不再设置 push/PR CI，也不要求 GitHub 检查通过才发布。在发布 PR 记录提交、命令、结果、Node 版本和实际覆盖平台。已有 amd64/arm64 证据保留为历史事实，不代表未来每次变更都已在两种架构验证。macOS/Windows Docker Desktop 在实机验收前继续标为实验支持。

运行时/CLI 变更还需在本地执行相应原生探针。用真实公开 digest 运行 `DSH_RUNTIME_IMAGE=ghcr.io/...@sha256:... node scripts/bind-runtime-image.mjs` 后，可用 `node scripts/experience-smoke.mjs` 验证不传镜像 override 的安装后 tarball；完成后将源码 manifest 恢复为 `image: null`。这是维护者本地检查，不再占用 Actions。

## 发布前提

- npm Trusted Publishing 已授权本仓库的 `release.yml` 和 `npm-release` environment；工作流使用 Node 24/npm >=11.5.1，不增加本地 npm token 发布路径。见 [npm 官方说明](https://docs.npmjs.com/trusted-publishers/)。
- GHCR 包 `ghcr.io/guomonth/dsh-multi-tenant-runtime` 允许工作流发布，并允许匿名拉取。首次创建的包默认私有：首次 candidate push 后，所有者需在包设置中将可见性改为 **Public**。见 [GitHub Container registry 文档](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)。Git 仓库公开不代表镜像包公开。
- 如果包尚不存在，首次获授权的发布运行可以创建候选镜像，然后在匿名拉取门禁停止。将已创建的包设为公开，再对同一次运行重跑失败 jobs。此门禁失败时 npm 尚未发布；不能绕过或虚构 digest。

## 发布经过审查的 main 提交

1. 完成本地相关验证，在发布 PR 记录证据，合并后记录 main SHA，无需等待 GitHub CI。
2. 获得发布授权后，打开 **Actions → Publish package → Run workflow**，选择 `main`。CLI 等价命令是 `gh workflow run release.yml --ref main`。记录运行的 head SHA，核对它就是待发布源码。
3. 工作流在 native amd64/arm64 runner 构建发布镜像、推送、组装多平台 digest，并匿名检查 manifest，不下载全部镜像层。不安装 Playwright 或执行质量测试；随后构建 npm 包、检查 registry 归属/版本，并绑定公开镜像 digest。
4. npm Trusted Publishing 携带 provenance 发布；轻量分发检查下载精确 npm 版本，检查 exports、AI 指引、CLI help、固定镜像引用、匿名 manifest 访问及 dist-tag，不启动原生 Host、浏览器或 SDK 测试套件。最后创建同一源码提交的 tag 与 GitHub Release。
5. 核对 npm `latest=0.8.0`、`v0.8.0` 指向运行 SHA、GitHub Release 存在。在本地执行 `node scripts/registry-smoke.mjs 0.8.0 latest` 和 `node scripts/experience-smoke.mjs dsh-multi-tenant@0.8.0`（需要 Docker/Chromium），或在全新环境验证 `npx -y dsh-multi-tenant@0.8.0 start`。确认原生 Web、停止重启后的文件与历史，并记录实际硬件覆盖。

npm 包通过固定镜像引用管理 DSH。使用者不需要 GHCR 登录、DSH 源码或本机构建镜像。本项目尚未配置 DockerHub 分发。

## 失败与恢复

npm 发布前修复失败门禁，再按情况基于经过审查的提交重跑。npm 发布后版本不可覆盖：不能改写产物、将 tag 指向其他提交，或假设重跑会替换内容。Registry preflight 遇到既有版本会跳过发布，继续核验已安装产物与通道；坏产物必须升新版本。发布后的验证失败会留下“npm 已存在、GitHub Release 未完成”的状态，必须明确报告，查明原因后才能宣告发版完成。

仅 tag/release 创建失败时，在同一 SHA 重跑失败 job；既有 tag 指向其他提交时直接失败。CLI 失败证据不要包含一次性链接或凭据。发布检查不自动把本地演示部署到公网。
