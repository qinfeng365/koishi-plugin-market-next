# koishi-plugin-market-next

![Version](https://img.shields.io/badge/version-3.4.9-blue)
![Koishi](https://img.shields.io/badge/Koishi-%5E4.18.11-6f42c1)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)
![License](https://img.shields.io/badge/license-AGPL--3.0-orange)

`koishi-plugin-market-next` 是一个面向 Koishi Console 的插件市场增强版。它继承原始 market 的安装、卸载、更新、依赖管理和控制台事件接口，同时把日常使用中最影响体验的部分重新打磨：默认市场源、刷新反馈、无限滚动、筛选交互、安装后的配置补齐，以及可选的 ChatLuna 插件市场查询工具。

仓库地址：[qinfeng365/koishi-plugin-market-next](https://github.com/qinfeng365/koishi-plugin-market-next)

## 目录

- [Next 优势](#next-优势)
- [功能概览](#功能概览)
- [安装与启用](#安装与启用)
- [配置项](#配置项)
- [ChatLuna 市场查询 Tool](#chatluna-市场查询-tool)
- [和原版 market 的区别](#和原版-market-的区别)
- [常见问题](#常见问题)
- [开发](#开发)
- [自动发布](#自动发布)
- [发布包内容](#发布包内容)
- [版本更新](#版本更新)
- [许可证](#许可证)

## Next 优势

原始 market 的核心能力仍然有用，但它在一些高频场景里容易让用户误判状态：网络正常却显示 `failed to fetch`、刷新按钮没有反馈、市场打开慢、分页停在空页、安装后还要去依赖页找“配置”。`market-next` 的目标不是推翻 Koishi 的插件管理链路，而是在保持兼容的前提下，让市场页面更像一个真正可用的插件管理中心。

这一版主要改进了这些地方：

- **默认使用大陆更友好的市场索引**：`https://registry.koishi.t4wefan.pub/index.json`。
- **当前源失败时自动回退**：优先尊重 `search.endpoint`，失败后依次尝试 t4wefan、Lipraty、itzdrli。
- **刷新有明确反馈**：手动刷新会进入 loading，并在完成或失败时提示。
- **首屏加载更稳**：市场索引加载不再等待依赖刷新完成，避免被 npm registry、本地依赖扫描或包元数据刷新拖住。
- **列表浏览更自然**：使用无限滚动加载更多插件，减少分页带来的空页和跳转成本。
- **筛选行为更清楚**：分类可以再次点击取消，关键词或筛选变化后会重置列表位置。
- **失败原因更可读**：市场加载失败时尽量展示实际 registry 和错误原因，而不是只给一个笼统的 fetch 失败。
- **缓存更有判断力**：缓存优先显示后，后台刷新会利用 ETag、Last-Modified 和内容 hash 判断索引是否变化，未变化时跳过重复 JSON 解析和写盘。
- **弱网少做无用功**：自动路由会提高上次成功源的优先级，并在命中可用源后取消其他候选源请求，减少额外带宽占用。
- **慢在哪里能看见**：`search.logLevel: debug` 时，市场页会拆分首屏与后台刷新，并显示下载、压缩方式、传输大小、路由评分、缓存读取、JSON parse、索引映射、前端筛选和虚拟滚动耗时。
- **安装后自动尝试补配置**：安装完成后等待 config 插件识别新包，再自动调用配置补齐逻辑，减少手动去依赖页点“配置”的次数。
- **AI 可以查市场**：可选注册 ChatLuna 只读工具，让 AI 按关键词、分类、状态、创建/更新时间、评分、下载量等条件查询插件。

## 功能概览

- 浏览 Koishi 插件市场。
- 搜索插件名、短名、简介和关键词。
- 按分类、认证状态、风险状态、废弃状态等信息筛选。
- 无限滚动加载市场插件。
- 安装、更新、卸载插件。
- 查看版本、评分、月下载量、创建时间、更新时间、维护者、npm 链接和 homepage / repository 链接。
- 检查依赖版本和 peer dependency 兼容结果。
- 支持批量模式、移除配置确认和 Gravatar 镜像配置。
- 支持缓存优先显示、后台校验和 debug 性能面板。
- 安装后自动尝试创建插件配置节点。
- 可选启用 ChatLuna 插件市场查询工具。

## 安装与启用

在 Koishi 项目目录安装：

```bash
npm install koishi-plugin-market-next
```

推荐在 Koishi Console 的插件页面启用。手写配置时，插件键名以你的 Koishi loader 生成结果为准，通常可以写成：

```yaml
plugins:
  market-next:
    search:
      endpoint: https://registry.koishi.t4wefan.pub/index.json
```

如果你已经启用了原始 market，建议只保留一个市场插件。`market-next` 为了兼容原有控制台页面和事件，内部插件名仍沿用 `market`。

## 配置项

常用配置：

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

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `registry.endpoint` | 跟随当前 npm 配置 | 安装插件时使用的软件源。 |
| `registry.timeout` | `5s` | 获取 npm 包元数据的超时时间。 |
| `registry.autoRoute` | `true` | 获取依赖版本失败时是否自动尝试备用 npm 源。 |
| `registry.retry` | `1` | 每个 npm 源获取版本失败后的重试次数。 |
| `registry.concurrency` | `4` | 批量获取依赖版本时的最大并发数。 |
| `search.endpoint` | `https://registry.koishi.t4wefan.pub/index.json` | 插件市场索引地址。 |
| `search.timeout` | `30s` | 获取市场索引的超时时间。 |
| `search.proxyAgent` | 空 | 请求市场索引时使用的代理。 |
| `search.autoRoute` | `true` | 当前市场源失败时是否自动尝试备用市场源。 |
| `search.logLevel` | `warn` | 市场后端日志级别：`silent`、`error`、`warn`、`info`、`debug`。 |
| `chatlunaTool` | `false` | 是否启用 ChatLuna 插件市场查询工具。 |

可选市场索引：

```yaml
plugins:
  market-next:
    search:
      endpoint: https://registry.koishi.chat/index.json
```

软件源和市场索引是两件事：

- `search.endpoint` 决定市场页面和 ChatLuna Tool 从哪里读取插件列表。
- `registry.endpoint` 决定安装、更新插件时从哪个 npm registry 下载包。
- `registry.autoRoute` 只影响 npm 包元数据和依赖版本获取；`search.autoRoute` 只影响市场索引获取。

当 `search.endpoint` 获取失败时，`market-next` 会自动尝试以下市场索引，不会把 fallback 写入你的配置文件：

- `https://registry.koishi.t4wefan.pub/index.json`
- `https://gitee.com/shangxueink/koishi-registry-aggregator/raw/gh-pages/market.json`
- `https://koi.nyan.zone/registry/index.json`
- `https://kp.itzdrli.cc`
- `https://koishi.itzdrli.cc`
- `https://registry.koishi.chat/index.json`

当 `registry.endpoint` 获取 npm 包元数据失败时，`registry.autoRoute` 会尝试以下 npm 源：

- `https://registry.npmmirror.com`
- `https://mirrors.cloud.tencent.com/npm`
- `https://registry.npmjs.org`
- `https://r.cnpmjs.org`

更多社区镜像可参考 [Koishi 论坛镜像一览](https://forum.koishi.xyz/t/topic/4000)。

测试单一市场源时可以关闭自动路由：

```yaml
plugins:
  market-next:
    search:
      endpoint: https://registry.koishi.chat/index.json
      autoRoute: false
```

排查加载、fallback 或缓存回退问题时可以提高日志级别：

```yaml
plugins:
  market-next:
    search:
      logLevel: debug
```

`debug` 级别会额外在市场页显示性能面板，并在后端日志输出分段耗时；面板中的“解压大小”是 JSON 文本大小，“传输大小”来自响应头 `Content-Length`，压缩流或分块响应没有该响应头时会显示为空。默认 `warn` 不会输出这些诊断日志。

市场搜索输入已做 120ms 防抖，并设置 500ms 最大等待上限；连续输入时不会每个字符都触发完整筛选，但长时间连续输入也会定期同步结果。

## ChatLuna 市场查询 Tool

开启 `chatlunaTool` 后，如果当前 Koishi 同时安装并启用了 ChatLuna，本插件会注册只读工具：

```text
koishi_plugin_market_search
```

它只读取市场索引，不会安装插件、卸载插件、写配置或修改 `package.json`。

为移除旧版 LangSmith 带来的高危 audit 项，`3.4.1` 起 ChatLuna Tool 使用 `@langchain/core` 1.x；该依赖要求 Node.js 20 或更高版本。较新的 Koishi Desktop / Node 22 环境可以直接使用。

支持的输入：

| 参数 | 说明 |
| --- | --- |
| `intent` | 查询意图：`search`、`recommend`、`recent`、`popular`、`risk`、`compare`。省略时会根据参数自动推断。 |
| `query` | 关键词搜索，匹配插件名、短名、描述和 keywords。 |
| `requirements` | 用户自然语言需求，例如“找一个好用的 onebot 适配器”。 |
| `names` | 插件包名或短名列表，用于精确查询或对比。 |
| `category` | 分类过滤，例如 `adapter`、`ai`、`tool`、`game`、`webui`。支持数组、单个字符串或逗号分隔字符串。 |
| `status` | 状态过滤：`verified`、`insecure`、`preview`、`portable`、`deprecated`。支持数组、单个字符串或逗号分隔字符串。 |
| `createdAfter` / `createdBefore` | 创建时间范围，支持 `YYYY-MM-DD` 或 ISO 日期。 |
| `updatedAfter` / `updatedBefore` | 更新时间范围。 |
| `createdWithinDays` | 最近新增，例如 `30` 表示最近 30 天新增。 |
| `updatedWithinDays` | 最近更新。 |
| `sort` | `relevance`、`rating`、`downloads`、`created`、`updated`。 |
| `order` | `asc` 或 `desc`。 |
| `limit` | 返回数量，范围 1 到 50，默认 10。 |
| `includeHidden` | 是否包含隐藏插件。 |
| `includeDeprecated` | 是否包含废弃插件。 |

示例：

```json
{
  "query": "onebot",
  "sort": "downloads",
  "limit": 10
}
```

```json
{
  "intent": "recommend",
  "requirements": "找一个稳定的 AI 聊天插件",
  "status": "verified"
}
```

```json
{
  "intent": "compare",
  "names": ["koishi-plugin-adapter-onebot"]
}
```

工具返回 JSON 字符串，包含 `summary`、`results`、`filters` 和 `nextQueries`。工具会在进程内缓存市场索引 10 分钟。请求失败但已有旧缓存时，会返回 `stale: true` 的旧结果并标注失败原因；请求失败且没有缓存时，会返回 JSON 错误对象。

## 和原版 market 的区别

| 场景 | 原版 market | market-next |
| --- | --- | --- |
| 默认市场索引 | 官方源为主 | 默认 t4wefan 镜像 |
| 市场源异常 | 等待当前源超时或失败 | 当前源失败后自动 fallback |
| 刷新按钮 | 反馈不明显 | loading、成功、失败都有反馈 |
| 网络错误 | 容易只看到 `failed to fetch` | 展示 registry 和错误原因 |
| 浏览方式 | 分页 | 无限滚动 |
| 分类筛选 | 再次点击可能无法取消 | 可切换、可取消 |
| 搜索/筛选变化 | 可能停在空页 | 自动回到列表起点 |
| 首屏加载 | 可能被依赖刷新拖慢 | 市场索引和依赖刷新解耦 |
| 缓存校验 | 不明显 | 缓存优先显示，后台校验未变化时跳过重复解析 |
| 性能诊断 | 主要看日志猜测 | debug 模式显示后端和前端分段耗时 |
| 安装后配置 | 常需要去依赖页手动点配置 | 自动尝试补配置节点 |
| AI 查询 | 不支持 | 可选 ChatLuna Tool |

## 常见问题

### 插件市场加载很久

先检查 `search.endpoint` 是否能访问。默认地址是：

```text
https://registry.koishi.t4wefan.pub/index.json
```

如果该镜像在你的网络环境里不稳定，可以切换到官方源：

```yaml
plugins:
  market-next:
    search:
      endpoint: https://registry.koishi.chat/index.json
```

也可以适当提高超时时间：

```yaml
plugins:
  market-next:
    search:
      timeout: 60s
```

### 刷新 WebUI 后市场才显示

这通常表示后端已经拿到市场索引，但第一次 Console 连接时数据没有及时同步到前端，或者依赖刷新、前端过滤占用了较长时间。`3.4.0` 会优先返回缓存或市场索引，并在当前源失败时尝试备用源；手动刷新时也会重新读取本地 `package.json` 并清理旧的依赖版本请求状态。

### 缓存真的有用吗

有用，但它解决的是两类问题：打开市场时先显示旧索引，避免白屏；后台校验发现索引没变时，跳过重复 JSON 解析和缓存写盘。它不能解决首次安装后的冷启动下载，也不能让一个特别慢的源变快。冷启动仍然依赖源质量、网络和索引体积。

### 网络正常但显示 failed to fetch

常见原因包括：

- 当前 `search.endpoint` 返回慢或临时不可用。
- 浏览器侧 Console 连接尚未拿到后端同步数据。
- 代理配置只影响 npm 下载源，没有影响市场索引请求。
- 服务端能访问网络，但浏览器页面状态没有及时刷新。

可以先点市场刷新按钮；如果仍失败，再切换 `search.endpoint` 或提高 `search.timeout`。

### 安装后还是看不到配置

配置页面是否出现可配置项，最终取决于 config 插件是否已经识别到新安装的插件，以及该插件本身是否声明了配置 Schema。`market-next` 会在安装成功后等待包信息同步，再自动尝试补配置节点；如果插件需要重载后才暴露 Schema，仍可能需要手动重载一次或进入依赖页处理。

### ChatLuna 没有出现工具

确认以下条件：

- 已安装并启用 `koishi-plugin-chatluna`。
- `chatlunaTool` 设置为 `true`。
- ChatLuna 当前运行环境支持工具调用。
- 修改配置后已经重载 market 插件或重启 Koishi。

## 开发

本项目是 Koishi + TypeScript 插件，包含后端服务、Console 前端扩展和共享类型。

```bash
npm install
npm run audit:package
npm run audit:high
npm run build
npm pack --dry-run
```

脚本：

| 命令 | 说明 |
| --- | --- |
| `npm run audit:package` | 审计插件自身发布依赖树，排除 Koishi peer runtime。 |
| `npm run audit:high` | 审计完整安装树的高危及严重漏洞。 |
| `npm run build` | 生成 TypeScript 声明、后端 bundle 和前端 `dist`。 |
| `npm run build:dts` | 只生成 TypeScript 声明。 |
| `npm run build:js` | 只运行 JS / Console 构建。 |
| `npm pack --dry-run` | 检查发布包内容。 |

项目结构：

```text
src/node/        Koishi 后端入口、安装器、市场数据、ChatLuna Tool
src/browser/     浏览器侧 market provider
src/shared/      Console DataService 共享类型
client/          Koishi Console 前端页面与组件
dist/            Console 前端构建产物
lib/             后端与类型构建产物
```

## 自动发布

仓库内置两个 GitHub Actions workflows：

- `.github/workflows/ci.yml`：普通 push 和 pull request 运行 `npm ci`、`npm run audit:package`、`npm run audit:high`、`npm run build` 和 `npm run check:package`，只验证，不发布。
- `.github/workflows/publish.yml`：`v*` tag 或手动触发时运行同样的校验，然后通过 npm Trusted Publishing 发布到 npm。

首次使用前，需要在 npm 包设置里添加 Trusted Publisher：

- Package：`koishi-plugin-market-next`
- Repository：`qinfeng365/koishi-plugin-market-next`
- Workflow：`publish.yml`
- Environment：留空

发布新版本时先提交 `package.json`、`README.md`、`CHANGELOG.md` 等版本变更，再推送匹配版本号的 tag：

```bash
git tag v3.4.9
git push origin v3.4.9
```

也可以在 GitHub Actions 页面手动运行 `Publish to npm`，但输入版本必须与 `package.json` 一致，并且只能从默认分支触发。workflow 会先检查 npm 上是否已经存在同版本，存在则直接失败，避免覆盖发布。

当前安全策略分两层：`npm run audit:package` 要求插件自身发布依赖树没有已知漏洞；`npm run audit:high` 要求完整安装树没有高危或严重漏洞。`npm run check:package` 会检查发布包里是否包含 Console 所需的 `dist/index.js`、`dist/index.css` 和 `dist/style.css`，并确认两份 CSS 内容一致。完整 `npm audit` 中剩余的中危来自 Koishi peer runtime 的 Cordis / `file-type` 链路，npm 给出的修复路径会降级 Koishi 或跨 Cordis 主版本，因此不强行处理，避免为了 audit 破坏插件兼容性。

## 发布包内容

`package.json` 的 `files` 字段会发布：

- `lib`
- `dist`
- `src`
- `scripts`

同时 npm 会自动包含 `package.json`、`README.md` 和许可证信息。

## 版本更新

### 3.4.9

- CI 增加发布包内容断言，要求构建产物和 dry-run tarball 同时包含 `dist/index.css` 与 `dist/style.css`，并检查两份 CSS 内容一致。
- 安装插件成功后由后端自动创建默认的停用配置节点，使新插件能出现在“插件配置”页面；前端保留等待同步与兜底创建逻辑。

### 3.4.8

- 修复 3.4.3 起构建链路升级后只产出 `dist/index.css`，但 Koishi Console 目录入口仍只自动加载 `dist/style.css`，导致市场页面 JS 正常但样式未加载、图标按 SVG 原始尺寸撑爆页面的问题。
- 构建产物同时保留 `dist/index.css` 与 `dist/style.css`，兼容 `KOISHI_BASE` 静态入口和常规插件目录入口。

### 3.4.7

- 修复移动端 / 部分 WebView 下市场 SVG 图标没有正确继承 scoped CSS，导致筛选、搜索、关闭等图标按原始尺寸撑爆页面的问题。
- 市场页增加 `.market-icon` 全局尺寸兜底，搜索框与筛选栏图标改用穿透选择器约束尺寸。

### 3.4.6

- ChatLuna Tool 优化：增强工具描述，让模型更容易在插件搜索、推荐、对比、最近新增/更新、热门和风险查询场景调用市场工具。
- ChatLuna Tool 输入增加 `intent`、`requirements`、`names`，并允许 `category`、`status`、`names` 使用数组、单字符串或逗号分隔字符串。
- ChatLuna Tool 输出从 Markdown 列表改为 JSON 字符串，包含 `summary`、`filters`、`results`、`nextQueries` 和 stale/error 信息。
- ChatLuna Tool 注册增加成功、失败和注销诊断日志。
- 弱网优化：市场冷启动无缓存时先返回 loading payload，页面显示当前 registry、超时和自动路由状态，后端请求完成后自动刷新市场数据。

### 3.4.5

- CI 和发布 workflow 增加 `audit:package`，要求 market-next 自身发布依赖树排除 peer runtime 后为 0 漏洞。
- 保留完整安装树的高危 audit 门禁，继续阻止 high / critical 漏洞进入发布。
- README 补充 Koishi peer runtime 中危的来源和边界，避免把上游运行时链路误判为 market-next 发布包本体漏洞。

### 3.4.4

- 安全审计：通过 npm override 将 `@koishijs/plugin-console` 链路中的 `uuid` 收敛到 `11.1.1` 以上。
- 完整 `npm audit` 从 14 个中危降到 13 个中危；高危与严重漏洞保持为 0。
- 剩余中危来自 Koishi / Cordis 的 `file-type` 上游链路，未使用会破坏兼容或降级 Console 的强制修复。

### 3.4.0

- 市场索引缓存增加 ETag、Last-Modified 和内容 hash 元信息。
- 自动路由竞速在命中最快源后会取消其他候选源请求，减少弱网下的额外带宽占用。
- 后台刷新命中 HTTP 304 或相同 hash 时复用已有索引，跳过重复 JSON 解析和缓存写盘。
- `search.logLevel: debug` 时，市场页显示 debug 性能面板。
- debug 面板展示后端下载、缓存读取、JSON parse、索引映射、payload 构建，以及前端排序、筛选和虚拟滚动耗时。
- 详细性能、路由和缓存回退日志仅在 debug 级别输出，默认日志不增加噪音。
- 后台刷新缓存时，刷新菜单图标会显示旋转状态，避免看起来没有反馈。

### 3.3.4

- 依赖版本获取新增 loading/error 状态，避免请求中误显示“版本获取失败”。
- npm registry 版本元数据获取增加备用源自动路由、失败重试和批量并发限制。
- 自动路由镜像列表参考 Koishi 论坛镜像一览，并按实测可用性补充 Gitee 聚合、itzdrli 备用、腾讯 npm、cnpm 等源。
- 依赖页和安装弹窗会区分超时、网络失败、镜像未同步、元数据异常等原因。
- 手动刷新会重新读取本地 `package.json`，清理旧版本请求状态，并重新同步依赖、版本和插件状态。

### 3.3.2

- 增加本地市场索引缓存优先显示，打开市场时可先显示旧数据并在后台刷新。
- 使用缓存或旧 payload 时，在市场页面内显示固定提示。
- 自动路由改为并发竞速，当前源和备用源同时尝试，优先使用最快返回的有效市场索引。
- 市场列表加入虚拟滚动窗口，减少大量插件卡片同时渲染造成的前端卡顿。
- 修复插件 reload / dispose 后旧请求继续写回导致的上下文错误。
- 扩展 debug 日志，输出 endpoint、耗时、fallback、缓存、patch 进度等关键链路。

### 3.3.1

- 新增市场搜索输入防抖，降低输入时的前端重算频率。
- 新增 `search.logLevel` 多级日志配置。
- 新增 `search.autoRoute` 开关，可关闭备用市场源自动回退。
- 修复刷新按钮反馈不清晰的问题。

完整历史记录见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可证

AGPL-3.0
