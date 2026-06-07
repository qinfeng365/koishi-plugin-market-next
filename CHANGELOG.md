# Changelog

本文件记录 `koishi-plugin-market-next` 已发布到 npm 的版本差异。

## 3.3.2

- 增加本地市场索引缓存优先显示，打开市场时可先显示旧数据并在后台刷新。
- 使用缓存或旧 payload 时，在市场页面内显示固定提示，而不是只依赖临时消息。
- 自动路由改为并发竞速，当前源和备用源同时尝试，优先使用最快返回的有效市场索引。
- 市场列表加入虚拟滚动窗口，减少大量插件卡片同时渲染造成的前端卡顿。
- 修复插件 reload / dispose 后旧请求继续写回导致的 `context disposed`、`cannot create effect on inactive context`。
- 修复依赖页空对象访问导致的 `Cannot convert undefined or null to object`。
- 扩展 debug 日志，输出 endpoint、耗时、fallback、缓存、patch 进度等关键链路。
- 将缓存写盘移出关键刷新路径，减少 `JSON.stringify` 和文件写入阻塞市场返回。
- 将列表过滤/排序从渲染 computed 改为调度更新，降低同一轮渲染中的同步压力。

## 3.3.1

- 新增市场搜索输入防抖，降低输入时的前端重算频率。
- 新增 `search.logLevel` 多级日志配置：`silent`、`error`、`warn`、`info`、`debug`。
- 新增 `search.autoRoute` 开关，可关闭备用市场源自动回退。
- 修复刷新按钮反馈不清晰的问题，刷新时显示 loading，完成后显示成功或失败结果。
- 修复市场加载失败时错误原因不清楚的问题。

## 3.3.0

- 默认市场源改为 `https://registry.koishi.t4wefan.pub/index.json`。
- 优化市场打开速度，市场索引加载不再被依赖刷新阻塞。
- 新增 ChatLuna 只读市场查询工具 `koishi_plugin_market_search`，可按关键词、分类、状态、时间范围、评分、下载量等条件查询插件。
- 安装插件后自动尝试补充 config 插件配置节点，减少安装后手动进入依赖页配置的步骤。
- 插件 homepage / repository 链接优先关联 GitHub 仓库。
- 修复分类筛选再次点击无法取消、搜索变化后分页停在空页等交互问题。

## 3.2.1

- 修复安装后插件配置入口同步不完整的问题。
- 优化插件 homepage / repository 链接展示。
- 更新 README，突出 market-next 相比原始 market 的体验改进。

## 3.2.0

- 内置 ChatLuna 插件市场查询 Tool，可通过配置开关启用。
- Tool 使用当前 market 搜索配置，只读查询市场索引，不安装、不卸载、不写配置。
- 新增 10 分钟进程内缓存；请求失败但已有缓存时返回 stale 结果。
- 新增 `@langchain/core`、`zod` 依赖和可选 peer `koishi-plugin-chatluna`。

## 3.0.1

- 将版本从 3.0.0 升级为 3.0.1。
- 继续修复刷新按钮无反馈、市场加载失败提示不明确等初版问题。

## 3.0.0

- 基于 Koishi 原始 market 做 next 分支。
- 保留原有 `market/refresh`、`market/install`、`market/registry`、`market/package` 事件兼容。
- 默认使用 t4wefan 市场索引源。
- 改进刷新、搜索、筛选、依赖管理和安装配置体验。

## 2.11.12

- npm 历史兼容版本。
- 该版本早于 market-next 3.x 重构，本仓库不维护完整变更记录。

## 2.11.11

- npm 历史兼容版本。
- 该版本早于 market-next 3.x 重构，本仓库不维护完整变更记录。
