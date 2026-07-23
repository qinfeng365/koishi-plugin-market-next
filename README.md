# Market Next

[![npm version](https://img.shields.io/npm/v/koishi-plugin-market-next?color=3178c6)](https://www.npmjs.com/package/koishi-plugin-market-next)
[![CI](https://github.com/qinfeng365/koishi-plugin-market-next/actions/workflows/ci.yml/badge.svg)](https://github.com/qinfeng365/koishi-plugin-market-next/actions/workflows/ci.yml)
![Koishi](https://img.shields.io/badge/Koishi-%5E4.18.11-6f42c1)
![License](https://img.shields.io/badge/license-AGPL--3.0-orange)

面向 Koishi Console 的插件市场与依赖管理中心。Market Next 在兼容 Koishi 原有管理链路的基础上，提供缓存优先的市场加载、依赖更新、插件包、环境版本恢复、安装日志和弱网回退。

[npm](https://www.npmjs.com/package/koishi-plugin-market-next) · [更新日志](./CHANGELOG.md) · [问题反馈](https://github.com/qinfeng365/koishi-plugin-market-next/issues)

> [!IMPORTANT]
> Market Next 与 `@koishijs/plugin-market` 提供同名的 `market` / `installer` Console 能力。请只启用其中一个；同时启用可能造成侧边栏入口、服务和前端资源相互覆盖。

> [!WARNING]
> 市场自动路由包含官方地址、CDN、社区镜像和少量第三方 GitHub 代理；npm 元数据使用另一组 registry 镜像。自动路由不会静默改写你的 npm/yarn 全局配置，但市场索引仍会影响用户看到的插件信息。对来源有严格要求时，请关闭 `search.autoRoute`，并将 `search.endpoint` 设置为你信任的地址。

## 能做什么

### 插件市场

- 有缓存时先显示旧数据，再在后台验证新索引。
- 市场刷新失败时保留当前列表，不用空白页覆盖可用结果。
- 支持关键词、分类、状态、作者邮箱和创建/更新时间筛选。
- 提供综合、推荐、下载量、创建时间和更新时间排序。
- 使用虚拟窗口控制大列表的实际渲染数量。
- 提供性能模式与精致模式，兼容浅色、深色和纯黑主题。
- 维护者头像通过后端代理与本地缓存加载，并限制私网目标和响应大小。

### 依赖管理

- 启动后自动获取依赖最新版本；浏览器 F5 不会重复触发整轮探测。
- 按待应用、可更新、已忽略、异常、插件包、工作区等状态分组。
- 支持安装、卸载、版本切换、批量应用和预发布版本过滤。
- 可以临时忽略一次更新，也可以永久关闭指定依赖的更新提示。
- 包管理器失败时保留日志，并可由用户确认使用一次性备用 npm 源重试。
- 安装操作串行执行，避免多个包管理器进程同时修改 `package.json` 和 lockfile。

### 恢复与审计

- 每次安装、更新和卸载都会保存操作日志，默认保留 72 小时。
- 以整个 Koishi 直接依赖环境为单位保存版本快照。
- 恢复前展示新增、移除、升级和降级差异。
- 包管理器失败时只回滚本次涉及的依赖键，尽量保留外部编辑。

### 插件包

- 支持一个插件包声明多个 Koishi 插件成员及建议配置。
- 安装前展示成员、版本范围、风险字段和最终变更。
- 成员配置默认停用，必须经过用户确认才会写入。
- 卸载时区分插件包分组配置与用户原有配置，避免顺手删除外部配置。

## 快速开始

### 从 Koishi Console 安装

1. 在插件市场中搜索包名 `market-next`。
2. 如果已经启用 `@koishijs/plugin-market`，先停用它。
3. 安装并启用 `market-next`，随后刷新 Console。

这是新用户最推荐的安装方式，不需要手工修改 `koishi.yml`。

### 从包管理器安装

在 Koishi 实例目录执行：

```bash
npm install koishi-plugin-market-next
```

也可以使用实例当前采用的 yarn 或 pnpm：

```bash
yarn add koishi-plugin-market-next
# 或
pnpm add koishi-plugin-market-next
```

然后在 Console 配置页添加并启用插件。最小配置如下：

```yaml
plugins:
  market-next:
    frontendMode: performance
```

## 基本使用

### 搜索与筛选

普通文本会匹配插件名、关键词和市场描述。多个条件可以组合：

| 示例 | 含义 |
| --- | --- |
| `onebot adapter` | 同时匹配两个关键词 |
| `category:adapter` | 只看适配器分类 |
| `is:verified` | 只看认证插件 |
| `not:preview` | 排除开发中插件 |
| `is:bundle` | 只看插件包 |
| `email:user@example.com` | 按维护者或贡献者邮箱筛选 |
| `updated:within:30` | 最近 30 天内更新 |
| `created:>=2026-01-01` | 不早于指定日期创建 |
| `show:deprecated` | 显示默认隐藏的废弃插件 |
| `sort:recommend` | 使用推荐排序 |

左侧筛选是临时条件。配置页中的“永久静默过滤”会直接隐藏命中的插件，不会在搜索框中留下条件标签。

### 依赖更新

1. 打开侧边栏的“依赖管理”。
2. 等待本地依赖快照出现；远端 latest 状态会随后补齐。
3. 在单个依赖卡片中选择版本，或使用批量更新功能。
4. 检查确认弹窗中的变更，再执行安装。
5. 安装失败时打开“最近操作”查看完整包管理器日志。

待应用变更只是计划，不代表已经修改 `node_modules`。只有确认执行后，Market Next 才会写入依赖并启动实例当前使用的包管理器。

### 安装备用源

市场源与 npm 安装源不是同一概念：

- `search.endpoint` 负责插件市场索引。
- `registry.endpoint` 负责 npm 元数据；显式配置后也会作为包管理器的 `--registry`。
- 未配置 `registry.endpoint` 时，安装沿用实例当前 npm/yarn registry。

如果包管理器明确失败且 `registry.autoRoute` 已开启，Console 可以询问是否使用一个备用源重试。备用源只用于这一次安装，不写入 Koishi 配置，也不修改 npm/yarn 全局配置。

### 环境版本管理

“环境版本”记录的是某一时刻整个 Koishi 实例的直接依赖集合，不是单个插件的更新日志。

恢复快照时会重新计算当前环境与目标环境的差异，并再次经过确认和包管理器安装流程。工作区依赖、无法解析的版本和不支持自动处理的项目会在预览阶段阻止恢复。

环境快照不会恢复：

- Koishi 插件配置；
- 数据库表和数据；
- 插件创建的文件；
- 间接依赖的精确 lockfile 状态。

## 配置

建议通过 Koishi Console 配置页修改。下面的 YAML 展示主要默认值：

```yaml
plugins:
  market-next:
    frontendMode: performance
    depsLayout: grid

    search:
      endpoint: https://registry.koishi.t4wefan.pub/index.json
      timeout: 30s
      autoRoute: true
      logLevel: warn

    registry:
      timeout: 5s
      autoRoute: true
      retry: 1
      concurrency: 4
      installLogRetentionHours: 72

    idleProbe: true
    idleProbeDelay: 5m
    idleProbeBootDelay: 1m
    idleProbeInterval: 6h
    chatlunaTool: false
```

### 显示与后台任务

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `frontendMode` | `performance` | `performance` 为低动效模式，`polished` 为精致模式。 |
| `depsLayout` | `grid` | 依赖页使用 `grid` 或 `list` 布局。 |
| `idleProbe` | `true` | Console 无客户端时是否后台探测市场和依赖元数据。 |
| `idleProbeDelay` | `5m` | Console 无人在线多久后允许探测。 |
| `idleProbeBootDelay` | `1m` | Koishi 启动后至少等待多久。 |
| `idleProbeInterval` | `6h` | 两次空闲探测的最小间隔。 |
| `chatlunaTool` | `false` | 注册只读 ChatLuna 市场查询工具。 |

空闲探测只更新元数据和缓存，不安装插件。安装、卸载或更新正在运行时，本轮空闲探测会被跳过。

### 市场索引

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `search.endpoint` | 项目默认源 | 首选市场索引地址。 |
| `search.timeout` | `30s` | 单次市场索引请求超时。 |
| `search.proxyAgent` | 空 | 只用于市场索引请求的代理地址。 |
| `search.autoRoute` | `true` | 首选源失败或明显过慢时尝试备用源。 |
| `search.logLevel` | `warn` | `silent`、`error`、`warn`、`info` 或 `debug`。 |

### npm 元数据与安装

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `registry.endpoint` | 跟随实例当前 registry | npm 元数据首选源；显式设置后也传给包管理器。 |
| `registry.timeout` | `5s` | npm 元数据请求超时，不是整个安装任务超时。 |
| `registry.autoRoute` | `true` | 元数据失败时启用备用源，并允许安装失败后询问一次性重试。 |
| `registry.retry` | `1` | npm 元数据请求的重试次数。 |
| `registry.concurrency` | `4` | 批量刷新依赖版本时的最大并发。 |
| `registry.installLogRetentionHours` | `72` | 安装日志保留小时数。 |

### 永久静默过滤

规则值取决于规则类型：

- `preview`、`insecure`、`bundle`：值留空。
- `created-before`、`created-after`、`updated-before`、`updated-after`：填写 `YYYY-MM-DD`。
- `created-within`、`updated-within`：填写天数，例如 `30`。
- `custom`：填写市场高级条件，例如 `category:adapter`。

示例：

```yaml
marketSilentRules:
  - type: preview
    value: ''
    note: 隐藏开发中插件
    enabled: true
  - type: updated-before
    value: '2023-01-01'
    note: 隐藏长期未更新插件
    enabled: true
  - type: custom
    value: category:meme
    note: 隐藏特定分类
    enabled: false
```

## 数据与缓存

以下路径均相对于 Koishi 实例目录：

| 路径 | 内容 |
| --- | --- |
| `data/market-next.json` | 待应用变更、忽略记录、插件包归属和依赖分组状态。 |
| `data/market-next-environment-snapshots.json` | 直接依赖环境快照。 |
| `data/market-next-install-logs/` | 包管理器操作日志和摘要。 |
| `cache/market-next-index.json` | 市场源缓存元信息、校验信息和路由状态。 |
| `cache/market-next-index/` | 按市场源拆分的完整索引缓存。 |
| `cache/market-next-avatars/` | 成功获取的维护者头像。 |
| `cache/market-next-registry-stats.json` | npm 元数据源的本地路由统计。 |

真正的插件配置、显示模式、过滤规则和后台探测设置仍保存在 Koishi 配置树中。运行数据不会被塞进 `koishi.yml`。

缓存文件损坏或过期时会被忽略或重建。需要手工处理文件时，应先停止 Koishi，避免与正在进行的原子写入冲突。

## 指令

以下指令默认要求权限等级 4：

| 指令 | 说明 |
| --- | --- |
| `plugin.install <name>` | 解析插件包名、安装依赖并创建默认停用配置。 |
| `plugin.uninstall <name>` | 卸载指定插件依赖。 |
| `plugin.upgrade [name...]` | 检测并确认依赖更新。 |
| `plugin.upgrade --koishi` | 将 Koishi 本体加入更新目标。 |
| `plugin.upgrade --force` | 忽略更新屏蔽策略，强制选择可用更新。 |
| `plugin.clear-avatar-cache` | 清理内存和磁盘头像缓存。 |

## 安全边界

Market Next 会尽量降低误操作风险，但它不是插件沙盒或恶意代码扫描器：

- 安装 npm 包时，包管理器仍可能执行包声明的生命周期脚本。
- 市场中的认证、风险和推荐信息不能替代源码审查。
- 卸载依赖默认不会删除插件创建的数据库数据和文件；这些内容无法仅凭包名安全判断归属。
- 删除插件配置与卸载 npm 依赖是两个独立操作，界面会分别确认。
- 插件包预设配置只做字段风险提示，不会证明配置本身安全。
- 市场和依赖的可写 Console 事件使用权限等级 4。
- 头像代理限制协议、重定向目标、私网地址、内容类型和最大响应大小。

## 常见问题

### 侧边栏没有插件市场

确认 `market-next` 已启用、Console 服务正常，并且没有同时启用原始 `@koishijs/plugin-market`。升级前端资源后，建议完整重启一次 Koishi，再刷新浏览器。

### 市场页面一直加载

有缓存时 Market Next 会优先恢复缓存；首次安装或缓存不可用时仍需要下载完整市场索引。将 `search.logLevel` 临时设为 `debug`，可以在日志页查看实际源、缓存命中、HTTP 状态和解析耗时。

### 依赖版本一直显示等待

依赖版本来自 npm registry，不来自市场索引。检查日志中的 `npm registry endpoint`，必要时设置可访问的 `registry.endpoint`。`registry.timeout` 只控制单次元数据请求。

### 安装失败后不知道改了什么

打开依赖页右上角菜单中的“最近操作”。日志会保留退出码、使用的安装源、依赖差异和包管理器输出。失败回滚后仍应检查 `package.json` 与 lockfile 是否符合预期。

### 头像持续显示首字母

先确认实例可以访问头像来源。网络恢复后可执行：

```text
plugin.clear-avatar-cache
```

### 如何反馈问题

请在 [GitHub Issues](https://github.com/qinfeng365/koishi-plugin-market-next/issues) 提供：

- Market Next 与 Koishi 版本；
- 使用的 Node.js 与包管理器版本；
- 问题发生在市场、依赖、安装还是配置页面；
- 对应时间段的日志；
- 能稳定复现时的最短步骤。

请在公开日志前移除 token、代理凭据、私有源地址和其它敏感信息。

## ChatLuna 工具

同时安装并启用 ChatLuna 后，可以开启：

```yaml
chatlunaTool: true
```

插件会注册只读工具 `koishi_plugin_market_search`，用于搜索、推荐、分类筛选、最近更新和插件对比。该工具不会安装、卸载或修改 Koishi 配置。

## 插件包作者

插件包名称必须使用：

- `koishi-plugin-pa-*`
- `@scope/koishi-plugin-pa-*`

建议同时添加 keyword `market:package`，并在 `package.json` 中声明 `koishi.bundle`：

```json
{
  "name": "koishi-plugin-pa-example",
  "keywords": ["koishi", "plugin", "market:package"],
  "koishi": {
    "bundle": {
      "label": "Example Bundle",
      "description": "A group of plugins installed together.",
      "members": [
        {
          "package": "koishi-plugin-example-core",
          "plugin": "example-core",
          "version": "^1.0.0",
          "required": true,
          "config": {
            "enabled": false
          }
        }
      ]
    }
  }
}
```

成员字段：

| 字段 | 说明 |
| --- | --- |
| `package` | 必填，小写 Koishi 插件 npm 包名。 |
| `plugin` | 必填，写入 Koishi 配置树时使用的插件键。 |
| `version` | 必填，合法 semver range；不会默认补成 `latest`。 |
| `required` | 核心成员默认勾选，可选成员默认不勾选。 |
| `config` | 可选预设配置，安装前必须由用户确认。 |

`npm run check:package` 会检查空成员、自引用、非法包名、非法版本范围、重复成员和明显的插件键冲突。

## 开发

CI 使用 Node.js 24。安装依赖并验证项目：

```bash
npm ci
npm run audit:package
npm run audit:high
npm run build
npm run check:package
npm pack --dry-run
```

源码位于 `src/` 和 `client/`。`lib/` 与 `dist/` 是构建产物，不应脱离源码单独修改。

Windows 下可以将当前源码构建并部署到本地 Koishi Desktop 默认实例：

```powershell
npm run deploy:local
```

指定其它实例：

```powershell
npm run deploy:local -- -InstancePath 'C:\path\to\koishi-instance'
```

## 发布

- 普通 push 和 pull request 由 `CI` workflow 执行审计、构建与包内容检查。
- `v*` Git tag 会触发 npm Trusted Publishing。
- 预发布版本按 semver 后缀发布到对应 dist-tag，正式版本发布到 `latest`。
- 完整版本变化记录在 [CHANGELOG.md](./CHANGELOG.md)。

## 许可证

本项目在 `package.json` 中声明为 [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)。
