# koishi-plugin-market-next

![npm](https://img.shields.io/npm/v/koishi-plugin-market-next?color=3178c6)
![Koishi](https://img.shields.io/badge/Koishi-%5E4.18.11-6f42c1)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)
![License](https://img.shields.io/badge/license-AGPL--3.0-orange)

`koishi-plugin-market-next` 是 Koishi Console 的插件市场增强版。它保留原始 market 的安装、卸载、更新和依赖管理能力，但把弱网加载、刷新反馈、缓存回退、无限滚动、安装后配置补齐、调试日志和 ChatLuna 查询工具重新做成更适合日常使用的版本。

`3.5.5` 是本项目的第一个正式 release。`3.5.6-alpha.2` 是弱网依赖版本刷新策略的当前 alpha 测试版，默认不会替换 npm 的 `latest` 渠道。

## 为什么做 Next

原始 market 的功能基础很好，但在真实使用里常见几个痛点：

- 市场索引 4MB 左右，弱网下容易长时间空白。
- 刷新按钮反馈弱，用户不知道是没点上、正在请求还是已经失败。
- 网络正常时也可能因为 registry、镜像、跨源缓存或超时策略显示 `failed to fetch`。
- 市场索引加载和依赖版本刷新相互影响，npm registry 慢会拖住市场页。
- 分页和筛选容易停在空页。
- 插件下载后还要去依赖页或配置页手动补配置。
- 调试信息主要在前端面板里，日志页不够好排查用户环境。

market-next 的目标不是破坏 Koishi 原有管理链路，而是在兼容原接口的前提下，让插件市场更像一个稳定的插件管理中心。

## 主要特性

- 默认市场索引：`https://registry.koishi.t4wefan.pub/index.json`。
- 缓存优先显示：有本地缓存时先显示旧数据，后台再校验最新索引。
- 默认源优先自动路由：用户配置的 `search.endpoint` 永远是主源，备用源只在主源失败或明显超时时接管。
- 多源缓存：不同市场源分别保存 ETag、Last-Modified、hash、压缩信息和索引数据。
- HTTP 304 / hash 命中：索引未变化时复用旧缓存，减少重复 JSON 解析。
- 无限滚动和虚拟窗口：减少分页空页和大量卡片同步渲染。
- 市场刷新软化：手动刷新不清空当前列表，页面保持可操作。
- 依赖刷新解耦：市场索引加载不再被 npm 包元数据刷新拖住。
- npm 元数据路由探测：依赖版本刷新先选一个代表包测试最快可用 npm 源，后续包复用同一轮结果。
- 安装后自动补配置：新安装插件会自动创建默认停用配置项，例如 `~schedule:xxxxxx: {}`。
- 更完整的错误提示：页面显示实际 registry、缓存状态、stale 状态和失败原因。
- 日志页诊断增强：`search.logLevel: debug` 时，关键调试信息会以 `[debug]` 前缀写入日志页。
- 可选 ChatLuna Tool：让 ChatLuna / AI 查询 Koishi 插件市场，支持搜索、推荐、最近新增、热门、风险状态和对比。

## 安装

在 Koishi 项目目录安装：

```bash
npm install koishi-plugin-market-next
```

然后在 Koishi Console 的插件配置页启用 `market-next`。

如果同时安装了原始 `@koishijs/plugin-market`，建议只启用其中一个。market-next 为了保持 Console 事件兼容，内部服务名仍使用 `market`。

测试 alpha 渠道：

```bash
npm install koishi-plugin-market-next@alpha
```

也可以固定安装某个 alpha 版本：

```bash
npm install koishi-plugin-market-next@3.5.6-alpha.2
```

## 基础配置

```yaml
plugins:
  market-next:
    search:
      endpoint: https://registry.koishi.t4wefan.pub/index.json
      timeout: 30s
      autoRoute: true
      logLevel: warn
    registry:
      autoRoute: true
      retry: 1
      concurrency: 4
    chatlunaTool: false
```

### 配置说明

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `search.endpoint` | `https://registry.koishi.t4wefan.pub/index.json` | 市场索引地址。 |
| `search.timeout` | `30s` | 市场索引请求超时。 |
| `search.proxyAgent` | 空 | 市场索引请求代理。 |
| `search.autoRoute` | `true` | 主市场源失败或明显超时时自动尝试备用市场源。 |
| `search.logLevel` | `warn` | 市场索引日志级别：`silent`、`error`、`warn`、`info`、`debug`。 |
| `registry.endpoint` | 跟随 npm 配置 | 安装插件和获取 npm 包元数据的软件源。 |
| `registry.timeout` | `5s` | npm 包元数据请求超时。 |
| `registry.autoRoute` | `true` | npm 包元数据失败时自动尝试备用 npm 源。 |
| `registry.retry` | `1` | 每个 npm 源失败后的重试次数。 |
| `registry.concurrency` | `4` | 批量获取依赖版本时的最大并发数。 |
| `chatlunaTool` | `false` | 是否注册 ChatLuna 插件市场查询工具。 |

## 市场源和自动路由

market-next 区分两类源：

- `search.endpoint`：市场页面和 ChatLuna Tool 使用的插件索引。
- `registry.endpoint`：安装、更新插件时使用的 npm registry。

`search.autoRoute` 不会改写用户配置。主源始终优先，备用源只在主源失败或超过阈值仍未返回时参与竞速。

内置市场备用源：

- `https://registry.koishi.t4wefan.pub/index.json`
- `https://gitee.com/shangxueink/koishi-registry-aggregator/raw/gh-pages/market.json`
- `https://koi.nyan.zone/registry/index.json`
- `https://kp.itzdrli.cc`
- `https://koishi.itzdrli.cc`
- `https://registry.koishi.chat/index.json`

内置 npm 元数据备用源：

- `https://registry.npmmirror.com`
- `https://mirrors.cloud.tencent.com/npm`
- `https://registry.npmjs.org`
- `https://r.cnpmjs.org`

更多社区镜像可参考 [Koishi 论坛镜像一览](https://forum.koishi.xyz/t/topic/4000)。

## 依赖版本刷新路由

依赖管理页显示“可更新版本”时，请求的不是 4MB 左右的市场索引，而是每个依赖包自己的 npm 元数据，例如 `https://registry.npmjs.org/koishi-plugin-xxx`。如果弱网环境下每个包都分别尝试多个 npm 源，132 个依赖就可能放大成大量超时等待。

`3.5.6` alpha 系列中，依赖版本刷新会先进行一次 npm registry route probe：

- 代表包选择顺序：`koishi`、`@koishijs/plugin-console`、第一个 Koishi 插件包、第一个普通依赖。
- 当前 `registry.endpoint` 始终作为主源先请求。
- 主源失败，或超过 1.5 秒仍未返回时，备用 npm 源才会启动竞速。
- 如果主源近期连续失败或平均耗时明显偏高，备用源启动延迟会自动缩短，但主源仍会先请求。
- 备用 npm 源会按 route score 排序，评分参考成功率、失败次数、平均耗时和最近成功时间。
- 不同失败原因有不同权重：超时和网络失败会较快降权，`not-found` / 镜像未同步只轻度降权。
- 第一个返回有效 `versions` 元数据的源会成为本轮刷新使用的 `metadataEndpoint`。
- probe 包自身的返回结果会直接复用，避免同一个包重复请求一次。
- 本轮后续 `getPackage()` / `market/registry` 请求优先走选中的源。
- 如果选中的备用源后续连续失败且分数低于主源，会自动回退到主源优先。
- 单个包请求也会执行慢源接管：首选源超时或失败时，备用源可在同一个请求内胜出并更新当前 `metadataEndpoint`。
- 这个选择只保存在进程内，不写入用户配置；下次刷新会重新判断。
- 如果 route probe 全部失败，会回到原有的逐包重试和备用源 fallback 行为。
- `registry.autoRoute: false` 时只请求 `registry.endpoint`，不会访问任何备用 npm 源。

这项策略主要解决“每个插件都单独试一遍 npm 链路”的等待放大问题。它不会改变安装命令真正使用的 npm registry；安装时仍按 `registry.endpoint` 和包管理器行为执行。

## 缓存策略

market-next 会把市场索引缓存到 Koishi 实例目录下的 `cache/market-next-index.json`。

缓存策略：

- 最多保留 3 个市场源缓存。
- 主源缓存优先用于首屏。
- 主源缓存不可用时，备用源缓存按路由评分、缓存新鲜度和最近使用情况选择。
- 后台刷新成功后写回对应源缓存。
- 支持 ETag、Last-Modified 和内容 hash。
- HTTP 304 或 hash 未变化时复用旧索引。
- 网络失败但已有旧 payload 时，页面继续显示旧数据并标记 stale。

这套策略的目的不是永远显示旧市场，而是让弱网用户先能操作，再在后台确认数据是否更新。

## 安装后配置补齐

通过 market-next 安装插件后，后端会尝试自动创建停用配置项：

```yaml
plugins:
  ~schedule:abc123: {}
```

这样插件会出现在“插件配置”页面，但默认不会启用。用户可以进入配置页检查配置后再手动启用。

这条链路覆盖：

- 市场页安装。
- 批量安装。
- `plugin.install` 指令安装。
- full reload 前的补配置。
- 启动时扫描已安装但未配置的插件并补齐。

## 调试日志

打开详细诊断：

```yaml
plugins:
  market-next:
    search:
      logLevel: debug
```

debug 模式会在日志页写入 `[debug] ...` 记录。这样即使 Koishi 全局 logger 不显示原生 `logger.debug()`，也能在日志页看到完整链路。

常见诊断内容包括：

- 市场源候选列表。
- 每个源的 route score、成功/失败次数、平均耗时、缓存命中。
- 磁盘缓存条目、缓存时间、hash、压缩方式、大小。
- 请求头和响应头。
- HTTP 304、hash-cache、network 三种结果。
- JSON parse 耗时。
- 首屏缓存和后台刷新耗时。
- fallback 原因：主源失败或主源慢。
- 安装依赖时的 package manager、变更包、是否触发 full reload。
- 依赖版本刷新总数、已安装数、invalid 数和耗时。
- npm registry route probe 的候选源、选中源、probe 包、失败原因和本轮实际 registry。

示例日志：

```text
[debug] market route scores before fetch: ...
[debug] market response headers: endpoint=..., status=304, request=276ms, ...
[debug] market disk cache store parsed: entries=2, ...
[debug] route success updated: endpoint=..., score=..., average=...
npm registry route probe started: probe=koishi, primary=..., fallbackCount=3, slowThreshold=1500ms
npm registry fallback race started: probe=koishi, reason=primary-slow, count=3, stagger=120ms
npm registry fallback selected: probe=koishi, endpoint=..., previous=..., reason=primary-slow, elapsed=...
dependency metadata refresh completed: total=132, installed=132, invalid=0, registry=..., elapsed=...
```

## ChatLuna 插件市场查询 Tool

开启：

```yaml
plugins:
  market-next:
    chatlunaTool: true
```

如果当前 Koishi 同时启用了 ChatLuna，本插件会注册只读工具：

```text
koishi_plugin_market_search
```

工具只查询市场，不安装、不卸载、不写配置、不改 `package.json`。

支持能力：

- 关键词搜索。
- 插件推荐。
- 最近新增。
- 最近更新。
- 热门插件。
- 分类筛选。
- 认证、风险、预览、可移植、废弃状态筛选。
- 按插件名精确查询或对比。
- 返回 JSON，包含结果、筛选条件、摘要和后续查询建议。

示例：

```json
{
  "intent": "recommend",
  "requirements": "找一个稳定的 OneBot 适配器",
  "status": "verified",
  "limit": 5
}
```

## 兼容接口

market-next 不移除原有 Console 事件：

- `market/refresh`
- `market/install`
- `market/registry`
- `market/package`

新增事件：

- `market/refresh-dependencies`
- `market/ensure-config`

配置兼容原 market 的 `market.override`、`bulkMode`、`removeConfig`、`gravatar` 等前端配置。

## 开发

安装依赖：

```bash
npm ci
```

构建：

```bash
npm run build
```

检查发布包内容：

```bash
npm run check:package
```

安全审计：

```bash
npm run audit:package
npm run audit:high
```

两个审计脚本都会排除 peer runtime；Koishi / Console / ChatLuna 由宿主环境安装，market-next 的发布门禁只检查本包实际携带的依赖树。

dry-run 打包：

```bash
npm pack --dry-run
```

## CI 和发布

仓库包含两个 GitHub Actions workflow：

- `CI`：普通 push 和 pull request 运行安装、审计、构建和包内容检查。
- `Publish to npm`：仅在 `v*` tag 或手动触发时发布 npm。

发布要求：

- tag 版本必须等于 `package.json` 版本。
- 手动发布只能在默认分支执行。
- 发布前检查 npm 是否已经存在同版本。
- 使用 npm Trusted Publishing，不需要 `NPM_TOKEN`。
- 预发布版本会按版本后缀选择 npm dist-tag，例如 `3.5.6-alpha.2` 发布到 `alpha`，正式版本发布到 `latest`。

## 3.5.6 Alpha Notes

`3.5.6-alpha.2` 主要用于验证弱网环境下的依赖版本刷新性能。

这一版重点关注：

- npm 元数据 route probe 是否能减少依赖页“版本获取中 / 版本获取失败”的等待时间。
- 选中源是否符合用户实际网络环境。
- 依赖管理页是否能先显示本地依赖快照，再由后台刷新补齐最新版本。
- 单个包请求在首选 npm 源变慢时，是否能及时让备用源接管，而不是一直死磕同一个源。
- 日志页是否能清楚显示慢在 probe、单包请求、镜像未同步还是网络超时。
- alpha 发布是否只更新 npm 的 `alpha` dist-tag，不影响 `latest` 用户。

## 3.5.5 Release Notes

`3.5.5` 是 market-next 的第一个正式 release。

这一版包含：

- 缓存优先显示和后台刷新。
- 默认源优先的自动路由。
- 多源缓存、ETag、Last-Modified、hash 校验。
- 无限滚动和虚拟滚动窗口。
- 市场索引加载与依赖版本刷新解耦。
- 弱网 loading payload 和 stale 旧数据提示。
- 安装后自动创建停用配置项。
- 详细日志页诊断，debug 模式输出 `[debug]` 链路记录。
- ChatLuna 插件市场查询 Tool。
- CI、发布 workflow 和包内容检查。

## 许可证

本项目使用 AGPL-3.0 许可证。
