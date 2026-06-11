# koishi-plugin-market-next

![npm](https://img.shields.io/npm/v/koishi-plugin-market-next?color=3178c6)
![Koishi](https://img.shields.io/badge/Koishi-%5E4.18.11-6f42c1)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)
![License](https://img.shields.io/badge/license-AGPL--3.0-orange)

`koishi-plugin-market-next` 是 Koishi Console 的插件市场增强版。它保留原始 market 的安装、卸载、更新和依赖管理能力，但把弱网加载、刷新反馈、缓存回退、无限滚动、安装后配置补齐、调试日志和 ChatLuna 查询工具重新做成更适合日常使用的版本。

`3.5.5` 是本项目的第一个正式 release。`3.5.6` 整合了 alpha 系列验证过的依赖管理页改版、npm 路由优化、更新忽略策略和可选精致模式，是当前推荐的稳定版本。

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
    frontendMode: performance
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
| `frontendMode` | `performance` | 前端显示模式：`performance` 为低动效高密度，`polished` 为精致动效和高级样式。 |
| `updateIgnoredPackages` | 空 | 不检测更新的依赖名，每行或用逗号分隔。 |
| `updateIgnoreDuration` | `0` | “忽略此次更新”的默认忽略时长，`0` 表示默认不限时。 |
| `updateIgnoreVersions` | `1` | “忽略此次更新”默认连续忽略几个新版本。 |
| `updateIgnorePrerelease` | `false` | 手动开启后，`alpha` / `beta` / `rc` 等预发布版本不会被视为可更新目标。 |
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

`3.5.6` 中，依赖版本刷新会先进行一次 npm registry route probe：

- 代表包选择顺序：`koishi`、`@koishijs/plugin-console`、第一个 Koishi 插件包、第一个普通依赖。
- 当前 `registry.endpoint` 始终作为主源先请求。
- 主源失败，或超过 800ms 仍未返回时，备用 npm 源才会启动竞速。
- 如果主源近期连续失败或平均耗时明显偏高，备用源启动延迟会自动缩短，但主源仍会先请求。
- 备用 npm 源会按 route score 排序，评分参考成功率、失败次数、平均耗时和最近成功时间。
- 不同失败原因有不同权重：超时和网络失败会较快降权，`not-found` / 镜像未同步只轻度降权。
- 第一个返回有效 `versions` 元数据的源会成为本轮刷新使用的 `metadataEndpoint`。
- probe 包自身的返回结果会直接复用，避免同一个包重复请求一次。
- 本轮后续 `getPackage()` / `market/registry` 请求优先走选中的源。
- 如果选中的备用源后续连续失败且分数低于主源，会自动回退到主源优先。
- 单个包请求也会执行慢源接管：首选源超时或失败时，备用源可在同一个请求内胜出并更新当前 `metadataEndpoint`。
- 本轮选中的 `metadataEndpoint` 只保存在进程内，不写入用户配置；路由评分会写入本地统计缓存，重启后沿用历史延迟与成功记录。
- 如果 route probe 全部失败，会回到原有的逐包重试和备用源 fallback 行为。
- `registry.autoRoute: false` 时只请求 `registry.endpoint`，不会访问任何备用 npm 源。

这项策略主要解决“每个插件都单独试一遍 npm 链路”的等待放大问题。它不会改变安装命令真正使用的 npm registry；安装时仍按 `registry.endpoint` 和包管理器行为执行。

## 依赖更新提示策略

`3.5.6` 增加了依赖更新提示控制，用来减少不需要处理的更新噪音：

- 可以在插件市场设置里填写“不检测更新的依赖名”，每行或用逗号分隔一个包名；这些依赖不会进入可更新或已忽略分组。
- 依赖卡片上的“忽略此次更新”会先询问忽略多久，可选不限时、1 天、7 天、30 天或自定义天数。
- 弹窗里也可以选择“永久不检测这个插件的更新”，确认后会写入不检测更新名单。
- “忽略时长”和“忽略版本数”设置作为弹窗默认值；忽略时长为 0 表示默认不限时。
- “忽略版本数”可控制连续忽略几个新版本，1 表示只忽略当前发现的最新版本。
- 已忽略更新会进入“已忽略更新”分组，可随时点“恢复提示”。
- “预发布版本过滤”默认关闭；手动开启后，`alpha`、`beta`、`rc` 等 prerelease 版本不会被视为可更新目标，系统会尽量继续寻找下一个稳定版本。

这些设置只影响 Console 的更新提示和“全部更新”目标选择，不会阻止用户在版本选择器里手动选择特定版本。

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
- 缓存条目超过 30 天会在后续写盘时自动清理。
- 市场源和 npm registry 的路由评分会持久化，重启后不必完全冷启动重新试源。

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

## 插件包 / Plugin Bundle

market-next 支持一种新的插件分发形态：插件包。插件包本身仍然是 npm 上的 Koishi 插件，但它可以声明一组成员插件，让用户在专用确认面板里一次审查、选择和安装。

适合的场景：

- 开发者维护一组实用插件，希望用户安装一个入口包就能拿到完整依赖列表。
- 一个生态由核心插件和多个外围插件组成，用户可以按需勾选成员。
- 插件包后续更新时，market-next 可以借助本地归属记录提示成员来源和辅助卸载。

### 命名和识别

npm 包名必须小写。推荐真实包名：

- `koishi-plugin-pa-xxx`
- `@scope/koishi-plugin-pa-xxx`

`koishi-plugin-PA-xxx` 只作为文档里的概念写法；真实 npm 包名不能使用大写，Koishi registry 也不会识别大写插件名。

market-next 识别插件包的方式：

- 包名匹配 `koishi-plugin-pa-xxx` 或 `@scope/koishi-plugin-pa-xxx`。
- `keywords` 包含 `market:package`。
- npm 元数据中提供结构化 `koishi.bundle` 清单。

推荐同时使用包名和 keyword。没有 `koishi.bundle` 的包只会显示“插件包”标识，不能展开安装。

### koishi.bundle v1

在 `package.json` 中声明：

```json
{
  "name": "koishi-plugin-pa-dialogue",
  "keywords": ["koishi", "plugin", "market:package"],
  "koishi": {
    "bundle": {
      "label": "Dialogue 插件包",
      "description": "一组对话系统相关插件。",
      "members": [
        {
          "package": "koishi-plugin-dialogue",
          "plugin": "dialogue",
          "version": "^1.0.0",
          "required": true,
          "config": {}
        }
      ]
    }
  }
}
```

字段说明：

- `members[].package`：成员 npm 包名，必须是有效 Koishi 插件包名。
- `members[].plugin`：写入 Koishi 配置树时使用的插件键。
- `members[].version`：必填 semver range。不会默认使用 `latest`。
- `members[].required`：核心成员默认勾选；可选成员默认不勾选。
- `members[].config`：预设配置。不会静默注入，必须由用户在安装面板确认后才写入。

### 安装安全策略

插件包不会走普通“一键安装”按钮，而是进入专用安装 GUI：

- 展示插件包自身、成员清单、required / optional、版本范围、安装状态、描述、作者/维护者、下载量和风险标识。
- 完整预设配置可展开查看。
- `command`、`script`、`exec`、`path`、`token`、`sql`、`url` 等敏感字段会高亮提醒。
- 用户可逐个选择安装/跳过、创建配置/不创建配置、使用预设配置/空配置。
- 最终确认区会展示新增依赖、配置分组、成员配置和跳过项。

配置写入规则：

- 安装成功后创建或复用确定性分组：`group:pa-<bundle-shortname>`。
- 成员配置默认停用，形如 `~dialogue:pa-pa-dialogue-dialogue`。
- 已存在配置时默认跳过，不重复创建。
- 用户选择“移动已有配置到插件包分组”时才会移动配置。
- 不会静默启用成员插件，不会静默删除用户配置。

卸载插件包时，market-next 会显示成员列表。默认只卸载插件包自身；用户可以选择把由该包记录的成员一起加入卸载。成员配置仍需要用户自行检查和清理。

### 发布校验

`npm run check:package` 会校验插件包清单：

- 插件包命名必须是有效小写 npm / Koishi 插件名。
- `members` 不能为空。
- `package`、`plugin`、`version` 必填。
- `version` 必须是合法 semver range。
- 成员不能引用插件包自身。
- 检查重复成员和明显 plugin 键冲突风险。
- 对本地可解析的成员包做直接循环检查。
- 缺少 `market:package` 只给 warning；缺少 version、自引用、非法包名会报错。

第一版暂不做 npm 依赖求解模拟；peer dependency 冲突仍由包管理器处理，但安装面板会尽量展示成员元数据和风险标识。

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
- 预发布版本会按版本后缀选择 npm dist-tag，例如 `3.5.6-alpha.4` 发布到 `alpha`，正式版本发布到 `latest`。

## 3.5.6 Release Notes

`3.5.6` 是依赖管理、路由性能和前端显示体验的稳定版更新，整合了 `3.5.6-alpha.0` 到 `3.5.6-alpha.6` 的测试内容。

这一版重点包含：

- 依赖管理页改为分组卡片工作台，降低 100+ 依赖环境下的视觉噪音。
- 依赖页先显示本地依赖快照，再由后台刷新补齐最新版本。
- npm 元数据 route probe 与单包慢源接管减少弱网下的版本获取等待。
- market 和 npm registry 路由评分持久化，重启后能继续利用历史延迟与成功记录。
- 可忽略单个更新、设置忽略时长/版本数，也可把指定依赖加入永久不检测更新名单。
- 预发布版本过滤可手动开启，避免 `alpha` / `beta` / `rc` 被误当成普通可更新目标。
- 普通“已安装”卡片增加插件身份标签、轻量类别色和简介行，待处理项仍保持更醒目。
- 市场页和依赖页支持 `Ctrl+K` / `Cmd+K` 聚焦搜索。
- 新增前端显示模式：默认性能模式保持低动效；精致模式提供更丰富的样式、层次和动效。
- 日志页继续输出更完整的 route、缓存、probe、单包请求和错误原因，便于定位弱网问题。

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
