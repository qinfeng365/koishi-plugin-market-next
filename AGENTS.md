# Market Next Agent 指南

本文件规定 AI 编程工具在本仓库中的工作方式，适用于仓库根目录下的全部内容。

- 能并行的工具调用尽量并行。
- 需求明确时直接动手，只有缺少关键信息、操作不可逆或有安全风险时才停下来确认。
- 文档、PR 描述用简体中文，中文句子使用中文标点。

## 仓库与分支

- 单包 Koishi 插件：`koishi-plugin-market-next`，TypeScript，用来替代 `@koishijs/plugin-market`（提供同名的 `market` / `installer` 能力）。
- 默认分支是 `master`，diff 以 `master` 或 `origin/master` 为准。
- 后端源码在 `src/`，构建到 `lib/`；Console 前端在 `client/`，构建到 `dist/`。
- `lib/`、`dist/` 虽然在版本库里，但发布时由 CI 重新构建。功能提交不要夹带构建产物，也不要手动改它们。
- 包含源自 [Koishi WebUI](https://github.com/koishijs/webui) 的代码，许可证为 AGPL-3.0，来源声明见 `NOTICE`。

## 工具与命令

- Node.js >= 18（CI 使用 24），使用 npm（仓库带 `package-lock.json`）。
- 安装依赖：`npm ci`
- 构建：`npm run build`（`tsc` 生成声明 → esbuild 打包 `src/` → `@koishijs/client` 用 Vite 打包 `client/`）
- 测试：`npm run test:dependency-source`（Node 内置测试运行器 + tsx，用例在 `scripts/*.test.mjs`）
- 包内容与 i18n 检查：`npm run check:package`（会顺带执行 `check:i18n`）
- 提交前至少跑一遍 `npm run build`、`npm run check:package`；动了 `src/` 还要跑测试。
- 不要新增 linter、formatter 或测试框架，除非被明确要求。

## 项目结构

```
src/
  index.ts              包入口，按运行环境导出 node / browser 实现
  node/
    index.ts            插件入口：Schema、服务注册、Console 能力
    config.ts           配置 Schema 与默认值
    market*.ts          市场索引：拉取、缓存、路由、快照、版本校验
    registry-*.ts       npm 元数据：拉取与备用源路由
    installer*.ts       安装器：串行安装、事务回滚、包管理器调用
    environment.ts      环境版本快照
    install-history.ts  安装日志
    local-*.ts          本地 .tgz 导入与本地依赖绑定
    bundle-installer.ts 插件包安装
    console-listeners.ts Console RPC
    chatluna*.ts        可选的 ChatLuna 只读查询工具
    commands.ts         plugin.install / uninstall / upgrade 等指令
    locales/            后端与配置页文案
  shared/               前后端共用的纯函数（插件包、依赖来源、更新策略）
client/
  index.ts / pages.ts / actions.ts   注册页面、全局弹窗、顶栏按钮
  utils.ts              配置与运行数据的读写、更新策略
  i18n.ts / i18n-runtime.ts           前端多语言
  components/           依赖管理页与各个弹窗
  market/               插件市场页（列表、筛选、搜索、卡片）
  extensions/           挂到 Koishi 插件配置页上的扩展（版本、缺失依赖、删除配置）
  locales/              前端文案，zh-CN 与 en-US 一一对应
scripts/                测试、i18n 检查、包检查
```

## 代码风格（必须遵守）

### 先求简单

这是对 AI 写代码最重要的一条要求。

- 写能工作的最简单代码：更少的抽象、更少的函数、更少的中间变量。拿不准就内联。
- **禁止**新写 `resolveXXX`、`normalizeXXX`、`ensureXXX`、`toSafeXXX` 这类包装函数；简单转换直接写在调用处。
- 抽函数要有理由，满足其一即可：
  - 逻辑不平凡（超过约 5 行）且被多处调用；
  - 虽然短，但写回调用处会让同一段代码重复三处以上；
  - 是多处必须保持一致的规则（比如同一份兜底推算），分开写容易改了一处漏了另一处。
- 只用一次的函数、只给一行表达式换个名字的函数，都写回调用处。例外：模板里的事件处理不止一条语句时，写成组件里的函数。
- 不要写推测性的防御代码。类型声明为必填就直接用，不要层层 `??` 兜底，也不要猜测值可能是别的类型；确实可能为空（类型里带 `?`）的值做一次简单检查即可。
- 只有重复使用、含义不直观或属于调参项的值才提取为常量。
- 类里不依赖 `this` 的方法，提到模块顶层作为普通函数。

```ts
// 禁止：一次性的包装函数
function resolveDisplayName(name: string) {
  return getMarketObject(name)?.shortname ?? name
}

// 推荐：直接写在用到的地方
const title = getMarketObject(name)?.shortname ?? name
```

### 完整实现

- 不留 `TODO`、占位实现或 `// ...` 省略；每个分支都写完整。
- 不确定的细节先按最合理的方式完整实现，再由人审查修正。错误但完整的实现，好过正确但残缺的骨架。

### 命名

- 新的局部变量、参数和小函数优先用短名：`ctx`、`cfg`、`err`、`opts`、`el`、`msg`、`idx`、`dep`、`pkg`。
- 只有单个词会产生歧义时才用多词组合，不要写 `existingConfig`、`resolvedTimeout`、`formattedMessage` 这类名字。
- 只用一次的值直接内联，减少变量数量。
- 改完后回头检查新加的标识符，能缩短的就缩短。

### TypeScript 与格式

- 与现有代码一致：2 空格缩进、单引号、不加分号、多行对象和参数列表保留尾逗号。
- 优先 `const`，用提前返回代替 `else` 和深层嵌套，用三元表达式代替先声明再赋值。
- 避免不必要的解构，保留 `session.userId`、`config.market` 这样的点号访问。
- 前后端共用的类型和纯函数放在 `src/shared/`，前端直接 import，不要重复定义。
- `any` 只用于和 Koishi 内部交互的局部位置。

### 注释

- 注释说明「为什么」，不复述代码在做什么。沿用文件里已有注释的语言。
- 不要写 `// Actions`、`// State`、`// List row mode` 这类分节注释。

## 前端约定

整体目标：看起来像 Koishi 自带的页面，用起来顺手，手机上也能正常操作。

- 页面用 `<k-layout>` + `<el-scrollbar>`，组件优先用 Element Plus（`el-button`、`el-select`、`el-dialog`、`el-dropdown`、`el-checkbox` 等）和 Koishi 自带组件（`k-empty`、`k-comment`、`k-card`）。
- 颜色只用 Koishi 主题变量：`--k-color-primary`、`--k-color-border`、`--k-color-divider`、`--k-card-bg`、`--k-side-bg`、`--k-hover-bg`、`--fg1`～`--fg3`、`--k-color-success` / `--warning` / `--danger` 等。不要写死颜色，也不要在 JS 里判断深色模式。
- 保持 Koishi 的扁平风格：细边框、少量圆角、不用渐变背景、外发光、毛玻璃和大面积阴影做装饰。
- 状态用文字或小标签表达，不要给同一信息同时配色条、图标、徽章和说明文字。
- 空状态用 `client/components/empty-state.vue`（图标 + 标题 + 一句说明），不要只放一行灰字，也不要让弹窗留下大片空白。
- 选择版本用 `client/components/version-picker.vue`，不要直接用 `el-select`。
- 下拉菜单、上下文菜单的每一项都配一个图标。图标优先复用 Koishi 自带的和 `client/market/icons`，缺的放在 `client/icons/menu/`（24×24、线条风格、`stroke="currentColor"`），注册为 `market-next:<名称>`。
- 一行里只放一到两个主要按钮，其余操作收进「更多」下拉菜单。危险操作（卸载、删除）放在菜单底部，并经过确认。
- 弹窗统一用 `client/components/market-dialog.vue`（`<market-dialog>`，属性和插槽与 `el-dialog` 相同），它会把正文包进 `el-scrollbar`；样式在 `client/styles/dialog.scss`，负责限制最大宽度、内容区高度和底部按钮换行。`width` 只写设计宽度（如 `width="640px"`）。不要再给弹窗的 header / body / footer 单独铺背景色。
- 弹窗里的列表、分组标题和小标签用 `dialog.scss` 里的 `dialog-section`、`dialog-list`、`dialog-tag` 等共享类，不要每个弹窗各写一套。
- 必须同时适配桌面端和移动端（Koishi 在 768px 以下切换为移动布局），不能出现横向滚动。表格类布局在手机上改为纵向堆叠；插件包弹窗里「成员 + 复选框列」的表格例外，手机上保留列并收窄列宽，以免拆散首行的列名和全选。
- 改动样式后，截图核对浅色、深色、手机宽度三种情况。

## 文案与多语言

- 所有界面文字走 i18n：前端在 `client/locales/<语言>/` 与 `client/market/locales/`，后端和配置页在 `src/node/locales/`。
- zh-CN 与 en-US 的键必须一一对应，en-US 里不能出现中文；改完执行 `npm run check:i18n`。
- 删除不再使用的键，不要留着「以后可能用」。
- 文案要自然、简短，像在跟用户说话：说清楚「发生了什么」和「接下来能做什么」，不要堆砌术语和实现细节。

## Koishi 插件约定

- 可写的 Console 事件统一要求权限等级 4，新增 RPC 时照 `console-listeners.ts` 的现有写法注册。
- 安装、卸载、环境恢复都要经过安装器串行执行，失败时按现有事务逻辑回滚，不要绕过。
- 运行数据写在 `data/market-next*.json` 和 `cache/market-next*`，不要写进 `koishi.yml`；用户可调的选项才放进配置 Schema。
- 外部请求（市场索引、npm 元数据、头像）走现有的路由与代理逻辑，不要另起直连请求。

## 错误处理与日志

- 预期内的失败（网络超时、版本不存在、包管理器退出码非 0）给出可读的提示，并保留日志供「最近操作」查看。
- 后台任务的非预期失败用 `warn` 记录，不要只记 `debug`。
- 不要为没有证据会失败的路径添加推测性的 `try` / `catch`。

## 本地联调

- 在 Koishi 实例里测试时，构建后把 `lib/`、`dist/`、`package.json` 同步到实例的 `node_modules/koishi-plugin-market-next/`，然后重启 Koishi。构建、同步、重启三步按顺序执行。
- Windows 下可用 `npm run deploy:local` 部署到 Koishi Desktop 默认实例。
- 测试时停用 `@koishijs/plugin-market`，两者不能同时启用。
