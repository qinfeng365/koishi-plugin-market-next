# Changelog

本文件记录 `koishi-plugin-market-next` 已发布到 npm 的版本差异。

## Unreleased

- 暂无。

## 3.5.6-alpha.5

这是面向弱网用户和依赖管理页体验的第六个 alpha 测试版，继续发布到 `alpha` 渠道，不替换 `latest`。

- 依赖管理页增加更新提示策略设置：可填写不检测更新的依赖名单，减少固定不想升级的插件噪音。
- “忽略此次更新”升级为可配置规则，点击时可选择不限时、固定天数或自定义忽略时长，并设置连续忽略版本数；也可直接将插件加入永久不检测更新名单；旧的 `updateIgnored[name] = version` 记录继续兼容。
- 已忽略更新进入独立分组，并提供“恢复提示”；忽略窗口内不会退回提示更旧的可更新版本。
- 增加手动开启的预发布版本过滤，开启后 `alpha`、`beta`、`rc` 等 prerelease 版本不会被视为可更新目标，“全部更新”也会避开这些版本。
- 市场缓存 / stale 提示在 `search.logLevel: silent` 时隐藏，避免静默模式下仍显示缓存提示。

## 3.5.6-alpha.4

这是面向弱网用户和依赖管理页体验的第五个 alpha 测试版，继续发布到 `alpha` 渠道，不替换 `latest`。

- 依赖管理页卡片继续降噪：普通“已安装”依赖不再重复显示 `已安装 / 已配置 / package.json / registry` 等低价值字段。
- 普通已安装依赖卡片增加插件身份识别，按适配器、数据库、控制台、核心、通用、AI、图片、媒体、游戏等类型显示轻量图标、标签和低饱和状态色，降低大批量已安装依赖的灰卡重复感。
- 普通已安装依赖卡片增加一行插件简介，优先读取市场 manifest 描述，其次读取 package description，帮助用户在列表中快速识别插件用途。
- 依赖卡片改为更紧凑的 row-card 结构，普通项默认收起版本选择器；待应用、可更新、未配置、异常和手动添加项仍直接展示关键操作。
- 依赖分组标题和顶部统计增加轻量状态层次，保留 Koishi Console 的克制风格，同时让待处理分组更容易扫到。
- 依赖管理页搜索框移到右侧、筛选项保留左侧，并支持 `Ctrl+K` / `Cmd+K` 聚焦搜索。
- 市场页搜索同样支持 `Ctrl+K` / `Cmd+K` 聚焦，关键词匹配改进为大小写不敏感，并兼容 manifest 多语言描述。

## 3.5.6-alpha.3

这是面向弱网用户的第四个 alpha 测试版，继续发布到 `alpha` 渠道，不替换 `latest`。

- 依赖管理页重构为按状态分组的卡片工作台，增加搜索、状态筛选、摘要统计和固定底部“待应用”操作条，降低 100+ 依赖环境下的视觉噪音。
- 依赖卡片显示短名和完整包名 tooltip，保留非标准包名，兼顾可读性与识别度。
- 增加“已下载未配置”分组和“添加配置”入口，帮助用户发现已经安装但插件配置页尚未出现的插件。
- 修复待安装/待卸载依赖在应用前从列表中消失或未置顶的问题，待应用项会持续显示直到用户确认或取消。
- 市场主页虚拟滚动减少滚动帧内布局测量，并对调试虚拟滚动指标做节流，降低长列表滑动卡顿。
- 依赖管理页显式订阅 `config` 与 `packages` 数据，避免直接打开页面时“未配置”检测缺少本地包和插件配置上下文。
- 未配置检测对齐 Koishi registry 的插件命名规则，并在缺少 `configWriter` 服务时不再误报所有已安装插件。

## 3.5.6-alpha.2

这是面向弱网用户的第三个 alpha 测试版，继续发布到 `alpha` 渠道，不替换 `latest`。

- 依赖管理页优先返回本地依赖快照，不再等待整轮 npm 元数据刷新完成；最新版本信息改为后台刷新后再推送到 Console。
- 依赖刷新按钮反馈改为“依赖版本刷新已开始”，匹配后台刷新语义，避免用户误以为所有远端版本已经同步完成。
- 普通包元数据请求不再死磕已选中的 `metadataEndpoint`：首选源慢或失败时会在同一个包请求内启动备用源 race，备用源胜出后立即更新 `metadataEndpoint`，避免一直优先请求 `npmmirror` 等已变慢的源。
- 后台依赖元数据刷新失败时会记录 warning 并清理任务句柄，避免异常状态卡住下一轮刷新。
- `audit:high` 与 `audit:package` 统一排除 peer runtime，避免 npm quick audit 把可选的 Koishi / ChatLuna 宿主依赖树误判为 invalid package tree。

## 3.5.6-alpha.1

这是面向弱网用户的第二个 alpha 测试版，继续发布到 `alpha` 渠道，不替换 `latest`。

- 重载 market-next 配置后，已安装插件配置补齐扫描改为延迟后台执行，不再阻塞插件 `ready`；扫描前会先判断是否已有配置，只对缺配置插件调用 `config/request-runtime`。
- 批量补齐插件配置时改为一次扫描、一次写入配置文件，并在长列表中定期让出事件循环，降低 100+ 插件环境下的卡顿。
- npm 元数据 route probe 从“全源立即并发竞速”改为“主源优先、主源慢或失败后备用源接管”；备用 npm 源按成功率、失败惩罚、平均耗时和最近成功排序，与市场索引自动路由策略保持一致。
- npm 元数据路由增加动态 fallback delay：主源连续失败或历史平均耗时过高时缩短备用源启动等待，主源健康时仍保持默认 1.5 秒观察窗口。
- npm 元数据路由按失败原因调整降权幅度：超时和网络失败重惩罚，HTTP 错误中等惩罚，`not-found` / 镜像未同步轻惩罚，避免真实包不存在时错误拉低所有源。
- 普通包元数据请求也使用 route score 排序；当当前 `metadataEndpoint` 连续失败且分数低于主源时，会自动降级回主源优先。
- 检测到 `registry.endpoint` 变化时清空旧 npm 路由评分，避免旧主源/备用源历史污染新配置。

## 3.5.6-alpha.0

这是面向弱网用户的 alpha 测试版，不会替换 `latest` 渠道。

- 依赖版本刷新增加 npm registry route probe：每轮刷新先选择代表包探测可用源，再把选中的 `metadataEndpoint` 复用到后续依赖元数据请求，减少弱网下每个包重复试多个 npm 源造成的等待放大。
- route probe 代表包选择顺序为 `koishi`、`@koishijs/plugin-console`、第一个 Koishi 插件包、第一个普通依赖；probe 包自身返回的 `Registry` payload 会被复用，避免立即重复请求同一个包。
- route probe 使用当前 `registry.endpoint` 与内置 npm 备用源并发竞速，第一个返回有效 `versions` 对象的源胜出；如果全部失败，会保留原有逐包重试和 fallback 行为。
- route probe 结果只保存在当前进程和当前刷新序列中，不写入用户配置，也不改变安装命令最终使用的 npm registry。
- 依赖刷新日志补充 `npm registry route probe started/selected/failed`、`refresh dependency metadata route ready` 和完成时实际 `registry`，便于在日志页判断慢在源选择、单包请求、镜像未同步还是网络超时。
- 修复市场页 `market-hint text-center` 下边距为负数导致首个 `package-list` 卡片在部分缩放 / WebView 下遮挡统计文本的问题。
- 发布 workflow 会根据预发布后缀自动选择 npm dist-tag，例如 `3.5.6-alpha.0` 发布到 `alpha`，避免 alpha 版本误挂到 `latest`。

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
