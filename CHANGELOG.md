# Changelog

本文件记录 `koishi-plugin-market-next` 已发布到 npm 的版本差异。

## Unreleased

- 暂无。

## 3.5.5

market-next 的第一个正式 release。

- 重写 README，完整说明 next 定位、弱网策略、缓存策略、自动路由、安装后配置补齐、ChatLuna Tool、调试日志、CI 和发布流程。
- 安装插件后由后端自动创建默认停用配置项，例如 `~schedule:xxxxxx: {}`，覆盖市场页安装、批量安装、指令安装和 full reload 前补配置。
- 启动时扫描已安装但未配置的 Koishi 插件依赖，并补齐停用配置项，修复旧版本安装成功但插件配置页不显示的问题。
- 调整安装流程：依赖变更需要 full reload 时，先执行补配置回调，再刷新 Console 数据，最后触发 full reload。
- `search.logLevel: debug` 时，市场调试链路会以 `[debug]` 前缀写入日志页，避免被 Koishi 全局 debug 阈值吞掉。
- Debug 日志扩展到市场源候选、路由评分、缓存条目、请求/响应头、HTTP 304、hash 命中、JSON parse、缓存裁剪、route stats 和错误 stack。
- 依赖安装与版本刷新增加日志，记录 package manager、依赖变更、是否触发 full reload、依赖数量、invalid 数和耗时。
- 刷新市场或依赖版本时移除全局阻塞 loading，改为只让对应刷新按钮显示旋转状态；已有缓存内容保持可操作。

## 3.5.0

- 全面调整市场运行策略：市场索引刷新与依赖版本刷新解耦，避免 npm registry 慢请求拖住市场刷新。
- 自动路由评分改为按延迟、成功率、失败惩罚、缓存可用性和小幅配置偏好综合排序，慢但成功的源不再被持续抬高。
- 市场索引缓存改为多源缓存，兼容旧单缓存文件；后台刷新某个源成功时不再覆盖其他源的首屏缓存优势。
- 每个市场源独立使用自己的 ETag、Last-Modified 和 hash 缓存校验信息，避免跨源复用条件校验状态。
- Debug 路由评分增加候选源缓存标记和缓存时间，方便判断某个源被排序靠前是因为网络表现还是缓存可用。
- 插件配置页扩展改为局部数据可用即显示，不再因为市场索引未加载就整体隐藏依赖、详情、缺失插件和选择器扩展。

## 3.4.9

- CI 增加发布包内容断言，要求构建产物和 dry-run tarball 同时包含 `dist/index.css` 与 `dist/style.css`，并检查两份 CSS 内容一致。
- 安装插件成功后由后端自动创建默认的停用配置节点，使新插件能出现在“插件配置”页面；前端保留等待同步与兜底创建逻辑。

## 3.4.8

- 修复 3.4.3 起构建链路升级后只产出 `dist/index.css`，但 Koishi Console 目录入口仍只自动加载 `dist/style.css`，导致市场页面 JS 正常但样式未加载、图标按 SVG 原始尺寸撑爆页面的问题。
- 构建产物同时保留 `dist/index.css` 与 `dist/style.css`，兼容 `KOISHI_BASE` 静态入口和常规插件目录入口。

## 3.4.7

- 修复移动端 / 部分 WebView 下市场 SVG 图标没有正确继承 scoped CSS，导致筛选、搜索、关闭等图标按原始尺寸撑爆页面的问题。
- 市场页增加 `.market-icon` 全局尺寸兜底，搜索框与筛选栏图标改用穿透选择器约束尺寸。

## 3.4.6

- ChatLuna Tool 优化：增强工具描述，让模型更容易在插件搜索、推荐、对比、最近新增/更新、热门和风险查询场景调用市场工具。
- ChatLuna Tool 输入增加 `intent`、`requirements`、`names`，并允许 `category`、`status`、`names` 使用数组、单字符串或逗号分隔字符串。
- ChatLuna Tool 输出从 Markdown 列表改为 JSON 字符串，包含 `summary`、`filters`、`results`、`nextQueries` 和 stale/error 信息。
- ChatLuna Tool 注册增加成功、失败和注销诊断日志。
- 弱网优化：市场冷启动无缓存时先返回 loading payload，页面显示当前 registry、超时和自动路由状态，后端请求完成后自动刷新市场数据。

## 3.4.5

- CI 和发布 workflow 增加 `audit:package`，要求 market-next 自身发布依赖树排除 peer runtime 后为 0 漏洞。
- 保留完整安装树的高危 audit 门禁，继续阻止 high / critical 漏洞进入发布。
- README 补充 Koishi peer runtime 中危的来源和边界，避免把上游运行时链路误判为 market-next 发布包本体漏洞。

## 3.4.4

- 安全审计：通过 npm override 将 `@koishijs/plugin-console` 链路中的 `uuid` 收敛到 `11.1.1` 以上。
- 完整 `npm audit` 从 14 个中危降到 13 个中危；高危与严重漏洞保持为 0。
- 剩余中危来自 Koishi / Cordis 的 `file-type` 上游链路，未使用会破坏兼容或降级 Console 的强制修复。

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
