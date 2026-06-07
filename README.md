# koishi-plugin-market-next

更好用的 Koishi 插件市场与插件管理入口。`market-next` 基于原始 market 插件继续增强，目标是让插件搜索、安装、更新和 AI 查询都更稳定、更清楚、更顺手。

## Next 优势

- 默认使用更适合大陆网络的插件市场镜像：`https://registry.koishi.t4wefan.pub/index.json`。
- 修复原 market 中刷新按钮无效、刷新无反馈、网络正常但提示 `failed to fetch`、市场打不开等体验问题。
- 列表改为无限滚动，减少分页来回切换，浏览插件更直接。
- 搜索和筛选更稳定：分类再次点击可取消，关键词或筛选变化后不会停在空页。
- 安装、更新后会尽量让插件配置进入配置页可管理范围，降低“装了但找不到配置”的困惑。
- 内置可选 ChatLuna 插件市场查询工具，让 AI 能按关键词、分类、状态、时间范围、最近新增、最近更新、下载量和评分查询市场。
- ChatLuna 能力默认关闭；未安装 ChatLuna 时不会影响 market 正常加载。

## 功能概览

### 插件市场

- 浏览 Koishi 插件市场。
- 搜索插件名、短名、简介和关键词。
- 按分类筛选插件。
- 无限滚动加载更多插件。
- 安装、更新、卸载插件。
- 查看插件版本、评分、下载量、更新时间、维护者等信息。

### 网络与缓存

- 默认搜索源为 t4wefan 镜像。
- 支持通过 `search.endpoint` 自定义市场 index 地址。
- 支持 `search.timeout` 和 `search.proxyAgent`。
- ChatLuna 查询工具维护 10 分钟内存缓存；请求失败但存在旧缓存时会返回 stale 结果和失败原因。

### ChatLuna Tool

开启配置项 `chatlunaTool` 后，如果当前 Koishi 同时安装了 ChatLuna，会注册只读工具：

```text
koishi_plugin_market_search
```

支持的查询范围包括：

- `query`: 关键词搜索。
- `category`: 分类过滤，例如 `adapter`、`ai`、`tool`、`game`、`webui`。
- `status`: 状态过滤，包括 `verified`、`insecure`、`preview`、`portable`、`deprecated`。
- `createdAfter` / `createdBefore`: 创建时间范围。
- `updatedAfter` / `updatedBefore`: 更新时间范围。
- `createdWithinDays`: 最近新增。
- `updatedWithinDays`: 最近更新。
- `sort`: `relevance`、`rating`、`downloads`、`created`、`updated`。
- `order`: `asc` 或 `desc`。
- `limit`: 结果数量，1 到 50。
- `includeHidden`: 是否包含隐藏插件。
- `includeDeprecated`: 是否包含废弃插件。

这个工具只查询市场，不安装、不卸载、不写配置，也不修改 `package.json`。

## 配置

```yaml
plugins:
  market:
    search:
      endpoint: https://registry.koishi.t4wefan.pub/index.json
      timeout: 30s
    chatlunaTool: false
```

主要配置项：

- `registry`: 插件下载源设置。
- `search.endpoint`: 插件市场搜索 index 地址。
- `search.timeout`: 获取市场数据的超时时间。
- `search.proxyAgent`: 搜索市场时使用的代理。
- `chatlunaTool`: 启用 ChatLuna 插件市场查询工具，默认关闭。

## 开发

```bash
npm install
npm run build
npm pack --dry-run
```

构建产物：

- `lib`: 后端与类型产物。
- `dist`: 控制台前端产物。
- `src`: 源码。

## 版本

当前版本：`3.2.0`

## 许可证

AGPL-3.0

