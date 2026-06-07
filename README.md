# koishi-plugin-market-next

![Version](https://img.shields.io/badge/version-3.2.1-blue)
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
- [发布包内容](#发布包内容)
- [许可证](#许可证)

## Next 优势

原始 market 的核心能力仍然有用，但它在一些高频场景里容易让用户误判状态：网络正常却显示 `failed to fetch`、刷新按钮没有反馈、市场打开慢、分页停在空页、安装后还要去依赖页找“配置”。`market-next` 的目标不是推翻 Koishi 的插件管理链路，而是在保持兼容的前提下，让市场页面更像一个真正可用的插件管理中心。

这一版主要改进了这些地方：

- **默认使用大陆更友好的市场索引**：`https://registry.koishi.t4wefan.pub/index.json`。
- **刷新有明确反馈**：手动刷新会进入 loading，并在完成或失败时提示。
- **首屏加载更稳**：市场索引加载不再等待依赖刷新完成，避免被 npm registry、本地依赖扫描或包元数据刷新拖住。
- **列表浏览更自然**：使用无限滚动加载更多插件，减少分页带来的空页和跳转成本。
- **筛选行为更清楚**：分类可以再次点击取消，关键词或筛选变化后会重置列表位置。
- **失败原因更可读**：市场加载失败时尽量展示实际 registry 和错误原因，而不是只给一个笼统的 fetch 失败。
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
    chatlunaTool: false
```

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `registry.endpoint` | 跟随当前 npm 配置 | 安装插件时使用的软件源。 |
| `registry.timeout` | `5s` | 获取 npm 包元数据的超时时间。 |
| `search.endpoint` | `https://registry.koishi.t4wefan.pub/index.json` | 插件市场索引地址。 |
| `search.timeout` | `30s` | 获取市场索引的超时时间。 |
| `search.proxyAgent` | 空 | 请求市场索引时使用的代理。 |
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

## ChatLuna 市场查询 Tool

开启 `chatlunaTool` 后，如果当前 Koishi 同时安装并启用了 ChatLuna，本插件会注册只读工具：

```text
koishi_plugin_market_search
```

它只读取市场索引，不会安装插件、卸载插件、写配置或修改 `package.json`。

支持的输入：

| 参数 | 说明 |
| --- | --- |
| `query` | 关键词搜索，匹配插件名、短名、描述和 keywords。 |
| `category` | 分类过滤，例如 `adapter`、`ai`、`tool`、`game`、`webui`。 |
| `status` | 状态过滤：`verified`、`insecure`、`preview`、`portable`、`deprecated`。 |
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
  "category": ["ai"],
  "updatedWithinDays": 30,
  "status": ["verified"]
}
```

工具会在进程内缓存市场索引 10 分钟。请求失败但已有旧缓存时，会返回 stale 结果并标注失败原因；请求失败且没有缓存时，会返回明确错误。

## 和原版 market 的区别

| 场景 | 原版 market | market-next |
| --- | --- | --- |
| 默认市场索引 | 官方源为主 | 默认 t4wefan 镜像 |
| 刷新按钮 | 反馈不明显 | loading、成功、失败都有反馈 |
| 网络错误 | 容易只看到 `failed to fetch` | 展示 registry 和错误原因 |
| 浏览方式 | 分页 | 无限滚动 |
| 分类筛选 | 再次点击可能无法取消 | 可切换、可取消 |
| 搜索/筛选变化 | 可能停在空页 | 自动回到列表起点 |
| 首屏加载 | 可能被依赖刷新拖慢 | 市场索引和依赖刷新解耦 |
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

这通常表示后端已经拿到市场索引，但第一次 Console 连接时数据没有及时同步到前端，或者依赖刷新占用了较长时间。`3.2.1` 已将依赖刷新改为后台执行，市场索引会优先返回给页面。

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
npm run build
npm pack --dry-run
```

脚本：

| 命令 | 说明 |
| --- | --- |
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

## 发布包内容

`package.json` 的 `files` 字段会发布：

- `lib`
- `dist`
- `src`

同时 npm 会自动包含 `package.json`、`README.md` 和许可证信息。

## 许可证

AGPL-3.0
