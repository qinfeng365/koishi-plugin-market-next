# Changelog

本文件记录 `koishi-plugin-market-next` 已发布到 npm 的版本差异。

## 3.4.3

- 安全审计：通过 npm overrides 修复构建链路中的 `js-yaml` transitive 漏洞。
- 安全审计：试探升级 `@koishijs/client` 构建链路使用的 `element-plus` 与 `vite`，移除对应中危 audit 项。
- 完整 `npm audit` 从 20 个中危降到 14 个中危；高危与严重漏洞保持为 0。
- 剩余中危来自 Koishi / Console 最新上游链路，未使用会降级 `@koishijs/console` 的 `audit fix --force`。

## 3.4.2

- Debug 性能面板拆分首屏加载与后台刷新，避免缓存耗时和网络刷新耗时混在一起。
- 市场索引自动路由增加内存评分：成功源加权、失败源降权，并结合压缩方式和平均耗时排序。
- Debug 面板显示候选源评分、首屏来源、后台刷新来源、压缩方式和传输大小。

## 3.4.1

- 新增独立 CI workflow，在普通 push 和 pull request 时验证安装、构建、打包和高危依赖审计。
- npm 发布 workflow 增加高危依赖审计门禁，继续使用 Trusted Publishing。
- 升级 `@langchain/core` 到 1.x，移除 `langsmith` 旧版本带来的高危 audit 项。
- ChatLuna Tool 依赖链随 LangChain 1.x 要求 Node.js 20 或更高版本。
- 市场索引请求显式声明 `br,gzip,deflate` 压缩能力，debug 面板增加压缩方式、传输大小和压缩比例。
- 市场索引自动路由会提高上次成功源的优先级，并对后续候选源进行短延迟错峰请求。
- README 补充 CI、tag 发布、手动发布和高危 audit 策略说明。

## 3.4.0

- 市场索引缓存增加 ETag、Last-Modified 和内容 hash 元信息。
- 自动路由竞速在命中最快源后会取消其他候选源请求，减少弱网下的额外带宽占用。
- 后台刷新命中 HTTP 304 或相同 hash 时复用已有索引，跳过重复 JSON 解析和缓存写盘。
- `search.logLevel: debug` 时，市场页显示 debug 性能面板。
- debug 面板展示后端下载、缓存读取、JSON parse、索引映射、payload 构建，以及前端排序、筛选和虚拟滚动耗时。
- 详细性能、路由和缓存回退日志仅在 debug 级别输出，默认日志不增加噪音。
- 后台刷新缓存时，刷新菜单图标会显示旋转状态，避免看起来没有反馈。

## 3.3.4

- 依赖版本获取新增 loading/error 状态，避免请求中误显示“版本获取失败”。
- npm registry 版本元数据获取增加备用源自动路由、失败重试和批量并发限制。
- 自动路由镜像列表参考 Koishi 论坛镜像一览，并按实测可用性补充 Gitee 聚合、itzdrli 备用、腾讯 npm、cnpm 等源。
- 依赖页和安装弹窗会区分超时、网络失败、镜像未同步、元数据异常等原因。
- 手动刷新会重新读取本地 `package.json`，清理旧版本请求状态，并重新同步依赖、版本和插件状态。

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
