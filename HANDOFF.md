# koishi-plugin-market-next Developer Handoff

This document is the project-level engineering handoff for `koishi-plugin-market-next`.
It describes this repository, its runtime architecture, release discipline, operational
debugging paths, and the local development rules that matter for future maintainers.

It intentionally does not copy Koishi or ChatLuna skill/reference content. When framework
behavior is version-sensitive, inspect this repository's installed packages and source
first, then verify against upstream documentation only for the specific API being changed.

## 1. Current State

- Package name: `koishi-plugin-market-next`
- Current version at the time this handoff was written: `3.5.6-alpha.4`
- Main branch: `master`
- GitHub repository: `https://github.com/qinfeng365/koishi-plugin-market-next`
- npm release model:
  - Stable versions publish to `latest`.
  - Prerelease versions such as `3.5.6-alpha.4` publish to the prerelease dist-tag, for example `alpha`.
- Plugin identity:
  - Runtime plugin name is still `market`.
  - This is deliberate for compatibility with Koishi Console integrations and original market event names.
- Default market index endpoint:
  - `https://registry.koishi.t4wefan.pub/index.json`
- First formal release in this fork:
  - `3.5.5`
- Current alpha line:
  - `3.5.6-alpha.*`, focused on weak-network behavior, npm registry routing, and dependency management UI readability.

## 2. Project Goal

`market-next` is a replacement-style evolution of Koishi's original market plugin.
The product goal is to turn the market from a simple plugin list into a plugin
management center that behaves predictably under weak networks.

The core value propositions are:

- Faster first usable screen through disk cache-first loading.
- Better weak-network recovery through soft refresh and stale payload fallback.
- Automatic market registry routing without permanently rewriting user config.
- Automatic npm registry routing for dependency metadata fetches.
- Infinite and virtualized market list rendering.
- Clearer dependency management with grouped row-cards instead of a dense full table.
- Automatic disabled plugin config creation after install, so newly installed plugins appear in the config page.
- Optional read-only ChatLuna tool for plugin-market search and recommendation.
- Debug data designed for Koishi's log page and the market UI performance panel.

The main engineering principle is: do not block usable UI on network when a safe local
answer already exists.

## 3. Repository Map

Top-level files:

- `package.json`
  - Package metadata, npm files, scripts, dependencies, Koishi metadata, peer dependencies.
- `package-lock.json`
  - npm lockfile. Keep synchronized with `package.json` before every release.
- `build.mjs`
  - Builds Node/shared/browser bundles and Koishi Console frontend assets.
- `scripts/check-package.mjs`
  - Asserts required dist artifacts exist and are included in dry-run npm tarball.
- `README.md`
  - User-facing overview, installation, configuration, weak-network behavior, release notes.
- `CHANGELOG.md`
  - Release history. Must be updated before tagging any release.
- `.github/workflows/ci.yml`
  - Non-publishing verification workflow for push and pull request.
- `.github/workflows/publish.yml`
  - npm publish workflow for `v*` tags or manual dispatch.
- `HANDOFF.md`
  - This developer handoff.

Source directories:

- `src/node/`
  - Koishi backend runtime.
- `src/shared/`
  - Shared types and Console `DataService` base provider.
- `src/browser/`
  - Browser-side exports.
- `client/`
  - Koishi Console frontend pages, components, market UI, dependency UI, icons, locales.

Generated/build output:

- `lib/`
  - TypeScript and esbuild output for Node/shared/browser.
- `dist/`
  - Koishi Console public assets.
  - Must contain both `dist/index.css` and `dist/style.css`.
  - `dist/style.css` compatibility is required because Koishi Console directory entries expect it.

Do not manually edit generated `lib/` or `dist/` unless the task is explicitly about
checking generated output. Change source files and rebuild.

## 4. Build And Package Model

Important scripts:

```powershell
npm ci
npm run build
npm run check:package
npm pack --dry-run
npm run audit:package
npm run audit:high
```

Script meanings:

- `npm run build`
  - Runs `tsc -p tsconfig.json`.
  - Runs `node build.mjs`.
  - Builds backend JS, browser/shared entrypoints, and Console frontend.
- `npm run check:package`
  - Verifies required dist files:
    - `dist/index.js`
    - `dist/index.css`
    - `dist/style.css`
  - Verifies `dist/index.css` and `dist/style.css` have identical content.
  - Runs `npm pack --dry-run --json`.
  - Verifies required dist files are inside the package tarball.
- `npm run audit:package`
  - Runs `npm audit --omit=peer`.
  - Used to audit this package's publish dependency tree without treating optional peer runtime chains as this package's direct release blocker.
- `npm run audit:high`
  - Runs `npm audit --audit-level=high --omit=peer`.

Package artifact policy:

- `files` currently includes:
  - `lib`
  - `dist`
  - `src`
  - `scripts`
  - `CHANGELOG.md`
- If a new runtime-required file is added, confirm it is included in `files`.
- If a new public asset is added, confirm it is generated into `dist` and passes `check:package`.
- If Console CSS output behavior changes, update `build.mjs` and `scripts/check-package.mjs` together.

## 5. Public Compatibility Surface

Keep these interfaces compatible unless the user explicitly accepts a breaking change.

Backend plugin identity:

- `export const name = 'market'`
- `export const inject = ['http']`
- `Context.installer` service is implemented by this package.

Console events:

- `market/install`
- `market/refresh`
- `market/refresh-dependencies`
- `market/package`
- `market/registry`
- `market/ensure-config`

Console services/data:

- `market`
- `dependencies`
- `registry`
- `registryStatus`

Config branches:

- `registry`
  - Installer and npm metadata options.
- `search`
  - Market index endpoint, timeout, proxy, auto route, log level.
- `chatlunaTool`
  - Optional ChatLuna market search tool switch.

User Console config:

- `config.market.bulkMode`
- `config.market.removeConfig`
- `config.market.override`
- `config.market.gravatar`

Do not silently rename these fields. The frontend and existing user configs depend on them.

## 6. Backend Entry: `src/node/index.ts`

`src/node/index.ts` wires the plugin together.

Major responsibilities:

- Defines `Config`.
- Registers optional ChatLuna tool with `applyChatLunaTool(ctx, config)`.
- Registers `Installer` as the `installer` service.
- Registers command-line plugin commands:
  - `plugin.install`
  - `plugin.uninstall`
  - `plugin.upgrade`
- Registers Console providers and frontend entry when `console` and `installer` are available:
  - `DependencyProvider`
  - `RegistryProvider`
  - `RegistryStatusProvider`
  - `MarketProvider`
  - `ctx.console.addEntry(...)`
- Registers Console listeners for install, refresh, registry lookup, and config completion.
- Repairs installed-plugin config entries on Koishi ready.

Important implementation detail: plugin config completion.

- Installing a Koishi plugin dependency is not enough for Koishi's config page to show it.
- A plugin config entry must exist in `ctx.loader.config.plugins`.
- `ensurePluginConfig(ctx, name)` creates disabled config keys like:

```text
~schedule:abc123: {}
```

- The leading `~` means disabled by default.
- This is intentional. Newly installed plugins should appear in config page, but should not auto-enable.
- The function first attempts `config/request-runtime` via Console if available.
- If Console runtime request does not create the config entry, it writes the disabled entry directly.
- After batch changes it refreshes:
  - `config`
  - `packages`

Important behavior to preserve:

- New plugin config entries must be disabled by default.
- `ensurePluginConfigs()` yields every 20 packages to avoid long blocking loops.
- `ensureInstalledPluginConfigs()` scans existing installed plugin dependencies after ready and repairs missing disabled config entries.
- Do not create config entries for non-plugin packages.

## 7. Market Index Provider: `src/node/market.ts`

`MarketProvider` is the backend provider for the plugin market index.

Core responsibilities:

- Load market index from disk cache or network.
- Keep a current scanner/payload for Console.
- Use cache-first initial render when possible.
- Refresh in background without clearing usable data.
- Route market index requests across mirror candidates.
- Persist up to 3 endpoint cache entries.
- Emit debug/performance data for UI and logs.

Key constants:

- `DEFAULT_ENDPOINT`
  - `https://registry.koishi.t4wefan.pub/index.json`
- `FALLBACK_ENDPOINTS`
  - Includes the default endpoint, Gitee aggregator, `koi.nyan.zone`, `kp.itzdrli.cc`, `koishi.itzdrli.cc`, and official `registry.koishi.chat`.
- `FIRST_PAYLOAD_TIMEOUT`
  - 1.5 seconds.
  - First payload returns a loading object if no cache/scanner is ready by then.
- `FAST_ROUTE_THRESHOLD`
  - 1.5 seconds.
  - Fallback race starts when primary is slow.
- `MAX_CACHE_ENTRIES`
  - 3 endpoint entries.

Cache file:

```text
<koishi-base-dir>/cache/market-next-index.json
```

Current cache format:

```ts
interface CacheStore {
  version: 2
  entries: Dict<CacheFile>
  lastUsed?: string
}
```

Each `CacheFile` stores:

- endpoint
- fetchedAt
- validatedAt
- etag
- lastModified
- hash
- decoded size
- wire size
- content encoding
- full `SearchResult`

Cache strategy:

- On initial collect, if `forceRefresh` is false, try `applyDiskCache()`.
- Disk cache selection prefers `search.endpoint`.
- Fallback cache is used only if primary cache is absent or invalid.
- After disk cache is applied, background network refresh starts.
- Network response writes back to disk cache asynchronously.
- Cache pruning keeps:
  - last used endpoint
  - configured primary endpoint
  - highest scoring/fresh fallback entries
  - maximum 3 entries total

Soft refresh semantics:

- `market/refresh` still exists, but backend treats `refresh=true` as soft refresh.
- If current payload, scanner, or disk cache exists:
  - keep current page data usable
  - start or reuse background refresh
  - refresh Console immediately so UI can show refreshing state
  - refresh again on completion or failure
- If cold start has no usable data:
  - fall back to normal cold load.

This avoids the old behavior where manual refresh cleared the page and blocked all user actions.

Network fetch strategy:

- Requests use:
  - `Accept-Encoding: br,gzip,deflate`
  - `If-None-Match` when ETag exists
  - `If-Modified-Since` when Last-Modified exists
- Supported successful paths:
  - `network`
  - `http-304`
  - `hash-cache`
  - `disk-cache`
  - `legacy`
- `hash-cache` means response body arrived, but content hash matches cached content, so JSON parse can be skipped and cached result reused.

Routing strategy:

- Configured `search.endpoint` is always primary.
- Route score does not reorder fallback ahead of the configured primary.
- Fallbacks are sorted among themselves by score.
- Primary is started first.
- Fallback race starts only when:
  - primary fails, or
  - primary exceeds `FAST_ROUTE_THRESHOLD`.
- If fallback wins:
  - current request uses fallback endpoint
  - config is not rewritten
  - debug includes fallback reason
- If `search.autoRoute === false`:
  - only configured endpoint is used.

Debug logging:

- `search.logLevel` controls provider logs.
- Levels: `silent`, `error`, `warn`, `info`, `debug`.
- When `debug` is enabled, debug messages are mirrored as `info` records because Koishi's log page may hide debug records.
- Debug logs include:
  - endpoint candidates
  - route scores
  - request headers
  - response headers
  - decoded/wire size
  - content encoding
  - hash timings
  - JSON parse timings
  - cache selection and pruning
  - payload timings
  - fallback reason

Market UI debug payload:

- `MarketPerformanceSnapshot` includes:
  - source
  - endpoint
  - preferred endpoint
  - fallback reason
  - candidate count
  - decoded size
  - wire size
  - content encoding
  - object count
  - hash
  - ETag
  - Last-Modified
  - cache/validation timestamps
  - timings
- `MarketPerformance` may include:
  - `initial`
  - `refresh`
  - `routeScores`

Common debugging interpretation:

- High `request` time means network or endpoint latency.
- High `parse` time means JSON parsing cost.
- High `payloadData` means mapping scanner objects into payload dictionary is costly.
- High frontend sort/filter means client-side list work, not backend.
- `disk-cache` first screen plus slow `network` background is expected on weak networks.
- `hash-cache` still paid network and hash cost, but skipped parse and index rebuild.
- `http-304` is the cheapest successful network validation path.

## 8. Dependency Installer And npm Metadata: `src/node/installer.ts`

`Installer` is a Koishi service named `installer`.

Core responsibilities:

- Read local `package.json`.
- Resolve installed dependency versions from local packages.
- Fetch npm package metadata and compatible versions.
- Track version-fetch status per package.
- Apply dependency overrides to `package.json`.
- Run package manager install.
- Decide whether full reload is needed.
- Support automatic npm registry routing.

Key endpoints:

- Configured `registry.endpoint`, or system npm registry from `get-registry`.
- Built-in fallback npm registries:
  - `https://registry.npmmirror.com`
  - `https://mirrors.cloud.tencent.com/npm`
  - `https://registry.npmjs.org`
  - `https://r.cnpmjs.org`

Important runtime fields:

- `endpoint`
  - Configured/current primary npm registry.
- `metadataEndpoint`
  - Process-local selected endpoint for metadata fetches.
  - Not written into user config.
- `fullCache`
  - Package version metadata cache for frontend registry data.
- `registryStatus`
  - Per-package status for version metadata requests.
- `depCache`
  - Local dependency snapshot plus latest version fields when available.
- `depMetadataFresh`
  - Prevents repeated background metadata refreshes when already fresh.

Dependency refresh flow:

1. `refresh()` increments serial and resets endpoint.
2. Reloads root manifest.
3. Clears package metadata tasks/cache/status.
4. Builds local dependency snapshot immediately.
5. Starts metadata refresh.
6. Console can render local dependencies before all npm metadata has arrived.

Local snapshot includes:

- requested version range
- resolved installed version
- workspace flag
- invalid semver request flag
- previous latest version if safe to reuse

npm metadata route probe:

- For bulk dependency metadata refresh, a representative package is selected:
  - `koishi`
  - `@koishijs/plugin-console`
  - first Koishi plugin
  - otherwise first target dependency
- Probe tests current primary and fallbacks.
- Primary starts first.
- Fallback race starts when primary fails or is slow.
- First valid registry metadata response wins.
- Winning endpoint becomes `metadataEndpoint` for the current process/runtime.
- It is not persisted into config.

Single-package metadata fetch:

- `getRegistry(name)` sets `registryStatus[name].loading = true`.
- It ensures a metadata endpoint exists.
- It may reuse route probe result if the probe package is the same as requested package.
- It fetches through route-aware logic.
- It updates `registryStatus` with:
  - loading
  - reason
  - error
  - endpoint
  - attempts
  - elapsed
  - updatedAt

Registry status reasons:

- `timeout`
- `not-found`
- `network`
- `invalid`
- `http`
- `unknown`

Frontend must distinguish:

- loading: request is still in progress
- error: request has completed with failure

Do not show "版本获取失败" while `loading` is true.

Install flow:

1. Frontend accumulates `config.market.override`.
2. User confirms.
3. Frontend sends `market/install`.
4. Backend calls `ctx.installer.install(deps, forced, beforeReload)`.
5. Installer writes dependencies into root `package.json`.
6. Installer decides whether package manager must run.
7. If needed, it runs the detected package manager.
8. Installer refreshes local dependency data.
9. Backend ensures installed plugin config entries.
10. Console refreshes:
    - dependencies
    - registry
    - packages
    - config
11. Full reload is triggered only when changed loaded packages require it.

Important behavior:

- Removing a dependency is represented by an empty string in `override`.
- Pending removals must remain visible until "应用更改" completes.
- Workspace dependencies should not be treated as normal update targets.
- Invalid semver requests should not be force-upgraded by automatic update checks.

## 9. Shared Types And Data Services

`src/shared/index.ts` defines:

- `RegistryStatus`
- `MarketPerformanceSnapshot`
- `MarketRouteScore`
- `MarketPerformance`
- Console event type declarations
- Base abstract `MarketProvider`

Base `MarketProvider` responsibilities:

- Extends Console `DataService`.
- Adds listener for `market/refresh`.
- Starts market loading on Console connection when last timestamp is older than 12 hours.
- Manages `_task`, `_timestamp`, and `_error`.

`src/node/deps.ts` defines Console data providers:

- `DependencyProvider`
  - Service: `dependencies`
  - Data source: `ctx.installer.getDeps()`
- `RegistryProvider`
  - Service: `registry`
  - Data source: `ctx.installer.fullCache`
- `RegistryStatusProvider`
  - Service: `registryStatus`
  - Data source: `ctx.installer.registryStatus`

## 10. Console Frontend Entry: `client/index.ts`

Frontend entry responsibilities:

- Registers global install and confirm dialogs.
- Registers pages:
  - `/market`
  - `/dependencies`
- Registers settings for `config.market`.
- Receives backend push events:
  - `market/patch`
  - `market/registry`
  - `market/registry-status`
  - `market/registry-status/clear`
- Defines toolbar/menu actions:
  - refresh
  - install/apply changes
  - manual add
  - upgrade all
- Watches `config.market.override` and dependency state to clean completed changes.

Refresh UX:

- On `/market`, refresh sends `market/refresh`.
- Market refresh is soft:
  - UI should say request started/submitted.
  - Existing list remains usable.
  - Success message is shown when background refresh completes.
  - Failure message says usable data was preserved when stale payload exists.
- On `/dependencies`, refresh sends `market/refresh-dependencies`.
  - This is separate from market index refresh.
  - It refreshes dependency metadata and config state.

Important: do not merge market refresh and dependency refresh semantics. They solve different problems.

## 11. Market Frontend

Important files:

- `client/components/market.vue`
- `client/market/components/search.vue`
- `client/market/components/filter.vue`
- `client/market/components/list.vue`
- `client/market/components/package.vue`
- `client/market/utils.ts`

Market page behavior:

- Left side: category/status filters.
- Header: search component, result hint, stale/cache warning, debug panel.
- Main list:
  - infinite loading
  - virtualized rendering
  - frontend sort/filter debug timings
- Ctrl/Cmd+K focuses market search input.

Search rules:

- `client/market/utils.ts` handles frontend search, filters, categories, sorting.
- Search is case-insensitive and normalizes text with `NFKC`.
- Matching includes:
  - normalized package name
  - short name
  - tokenized names
  - keywords
  - localized manifest descriptions
- Advanced syntax is still supported:
  - `is:verified`
  - `is:insecure`
  - `is:preview`
  - `is:portable`
  - `is:installed`
  - `not:*`
  - `category:*`
  - `created:<date`
  - `created:>date`
  - `updated:<date`
  - `updated:>date`
  - `impl:*`
  - `locale:*`
  - `using:*`
  - `email:*`
  - `show:hidden`
  - `show:deprecated`
  - `sort:*`
  - `limit:*`

Virtual list rules:

- Default batch size is 24 unless `limit:` is used.
- List observes a sentinel for loading more.
- Scroll virtualization computes:
  - columns
  - row height
  - start/end indexes
  - top/bottom spacers
- Debug mode emits:
  - frontend sort time
  - frontend filter time
  - frontend virtual time
  - total/matched/visible/rendered counts

Performance-sensitive frontend changes:

- Avoid deep reactive arrays for thousands of market objects when a shallow ref is enough.
- Avoid recalculating filters on every render.
- Keep search/filter updates debounced or animation-frame scheduled.
- Preserve virtualization when changing card dimensions; update `measureLayout()` assumptions if card width/height changes significantly.
- Any new visible card field must be checked against 3000+ plugin objects.

## 12. Dependency Management Frontend

Important files:

- `client/components/dependencies.vue`
- `client/components/package.vue`
- `client/components/install.vue`
- `client/components/confirm.vue`
- `client/components/manual.vue`
- `client/components/utils.ts`
- `client/utils.ts`

Design intent:

- The dependency page should behave like a workbench, not a spreadsheet.
- Ordinary installed dependencies should stay visually quiet.
- Items requiring action should stand out:
  - pending changes
  - installed but unconfigured plugins
  - updatable dependencies
  - version metadata errors
  - manual additions
  - workspace dependencies

Groups:

- `待应用`
- `已下载未配置`
- `可更新`
- `版本异常`
- `工作区`
- `手动添加`
- `已安装`

Toolbar:

- Filter buttons on the left.
- Search on the right.
- Summary chips:
  - total
  - updatable
  - pending
  - unconfigured
  - errors
  - loading indicator
- Ctrl/Cmd+K focuses dependency search.

Card naming strategy:

- Main title should be a short display name.
- Full package name remains visible as secondary text and title tooltip.
- Rules:
  - `@koishijs/plugin-foo` -> `foo`
  - `koishi-plugin-foo` -> `foo`
  - `@scope/koishi-plugin-foo` -> `@scope/foo`
  - packages without Koishi plugin prefix keep full package name

Unconfigured plugin detection:

- A package is considered unconfigured when:
  - it is a plugin package,
  - it exists in `store.packages`,
  - `ctx.configWriter` exists,
  - `ctx.configWriter.get(name)` has no config entries.

Important: "installed but unconfigured" is not the same as "manual add".

Pending changes:

- `config.market.override` is the source of truth.
- If a user selects remove, keep the card visible in `待应用`.
- Do not remove the card from UI until dependency state confirms the change has been applied.
- The fixed bottom apply bar appears when override is non-empty.

Version selector visibility:

- Ordinary installed cards should not always show a large version selector.
- Show version controls when:
  - editing is active,
  - item is pending,
  - item is updatable,
  - item is error/manual,
  - action context requires version choice.

Status text rules:

- Loading metadata: "正在获取版本数据"
- Failed metadata: show clear reason and registry host.
- Workspace: explain it is local and not normal update target.
- Pending: explicitly say it takes effect after applying changes.
- Installed normal: avoid repetitive "nothing to do" text.

Visual rules:

- Keep normal cards neutral.
- Use limited accent color for state strip, icon, badge, or border.
- Avoid large blocks of red/yellow/green.
- Hover should change border, not create heavy movement.
- For 100+ dependencies, reduce per-card noise before adding more badges.

## 13. Plugin Config Auto-Completion

This feature was added because users installed plugins successfully but did not see them
on the plugin configuration page.

Backend path:

- `market/install` listener in `src/node/index.ts`
- `ensurePluginConfigs(ctx, installNames)`
- `ensurePluginConfig(ctx, name)`
- `createDisabledPluginConfig(ctx, shortname)`

Frontend path:

- `client/components/utils.ts`
- `ensureInstalledConfig(ctx, name, silent)`
- `ensureInstalledConfigs(ctx, names, silent)`
- `client/components/confirm.vue` calls `ensureInstalledConfigs()` after install.
- Dependency card "添加配置" calls `ensureInstalledConfig()`.

Rules:

- Config completion must create disabled entries by default.
- Do not auto-enable newly installed plugins.
- If `config/request-runtime` can create the runtime config, use it first.
- If not, write the disabled config entry directly through loader.
- Refresh config/packages after batch writes.
- Frontend fallback via `ctx.configWriter.ensure()` is allowed after backend request, but backend should be the reliable path.

Failure diagnostics:

- If a package installs but does not appear in config page:
  - verify it is recognized by `Scanner.isPlugin(name)`.
  - verify package exists in `store.packages`.
  - verify `ctx.loader.writable` is true.
  - verify `ctx.configWriter` exists on frontend.
  - inspect market logs for `created disabled default config entry`.
  - inspect Koishi config file for `~shortname:xxxx: {}`.

## 14. ChatLuna Tool

File:

- `src/node/chatluna.ts`

Config:

- `chatlunaTool: boolean`
- Default: `false`

Tool name:

- `koishi_plugin_market_search`

Purpose:

- Read-only Koishi plugin market query tool for ChatLuna/model usage.
- It helps AI answer:
  - plugin search
  - plugin recommendations
  - plugin comparison
  - recent additions
  - recent updates
  - popular plugins
  - verified/risk/deprecated status

Important constraints:

- No top-level ChatLuna runtime import.
- Uses `ctx.inject(['chatluna'], ...)`.
- If ChatLuna is absent, market plugin must still load normally.
- The tool never installs, uninstalls, updates, edits config, or modifies `package.json`.
- It uses current market `search.endpoint`, timeout, and proxy settings.

Dependencies:

- `@langchain/core`
- `zod`
- Optional peer:
  - `koishi-plugin-chatluna`

Input highlights:

- `intent`
  - `search`
  - `recommend`
  - `recent`
  - `popular`
  - `risk`
  - `compare`
- `query`
- `requirements`
- `names`
- `category`
- `status`
- created/updated date filters
- recent-within-days filters
- sort/order
- limit
- includeHidden/includeDeprecated

Input tolerance:

- `category`, `status`, and `names` accept:
  - arrays
  - single strings
  - comma/Chinese-comma/semicolon/newline separated strings
- Status aliases include English and Chinese variants for verified/insecure/preview/portable/deprecated.

Output:

- JSON string via `JSON.stringify(payload, null, 2)`.
- Fixed top-level fields:
  - `tool`
  - `registry`
  - `fetchedAt`
  - `stale`
  - `error`
  - `intent`
  - `filters`
  - `total`
  - `matched`
  - `returned`
  - `summary`
  - `results`
  - `nextQueries`

Tool cache:

- In-process only.
- TTL: 10 minutes.
- On fetch failure with old cache:
  - returns stale results with `stale: true`.
- On fetch failure without cache:
  - returns JSON error object.

Registration diagnostics:

- Log when tool is enabled and waiting for ChatLuna.
- Log successful registration.
- Log registration failure.
- Log disposal.

When changing this module:

- Keep output machine-readable JSON.
- Do not add install/modify capabilities.
- Do not import ChatLuna package at top level.
- Validate with ChatLuna absent and present.

## 15. Configuration Reference

Backend config shape:

```ts
export interface Config {
  registry?: Installer.Config
  search?: MarketProvider.Config
  chatlunaTool?: boolean
}
```

Market search config:

```ts
interface MarketProvider.Config {
  endpoint?: string
  timeout?: number
  proxyAgent?: string
  autoRoute?: boolean
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug'
}
```

Defaults:

- `endpoint`: `https://registry.koishi.t4wefan.pub/index.json`
- `timeout`: 30 seconds
- `autoRoute`: true
- `logLevel`: warn

Installer registry config:

```ts
interface Installer.Config {
  endpoint?: string
  timeout?: number
  autoRoute?: boolean
  retry?: number
  concurrency?: number
}
```

Defaults:

- `timeout`: 5 seconds
- `autoRoute`: true
- `retry`: 1
- `concurrency`: 4

Practical notes:

- `search.endpoint` is for market index JSON.
- `registry.endpoint` is for npm metadata and package manager install registry.
- These are different concerns and should not be conflated.
- Market route selection never writes back to `search.endpoint`.
- npm metadata route selection never writes back to `registry.endpoint`.
- Package manager install still uses configured `registry.endpoint` if set.

## 16. Logging And Debug Strategy

Market log categories:

- Logger name is `market`.
- Both market index and installer use this logger.

Market index debug logs include:

- start and refresh mode
- cache warm/cold state
- disk cache read/parse/apply
- cache entry selection
- endpoint candidates
- route scores before/after
- primary/fallback race events
- request headers and conditional headers
- response status/headers
- decoded and wire size
- compression type
- hash calculation
- JSON parse time
- payload mapping time
- background refresh result

Dependency metadata logs include:

- endpoint initialization
- local dependency snapshot
- route probe start/result
- route scores
- per-package metadata loading
- status reason
- dependency metadata refresh completion
- package manager command and exit code
- override writes
- reload decisions

Log level expectations:

- `warn`: suitable default for normal users.
- `info`: useful for release/support diagnosis.
- `debug`: should expose enough detail to diagnose routing/cache/performance from the Koishi log page.

Because Koishi's log page can hide debug records, market debug mode mirrors debug messages as info records with a `[debug]` prefix. This is intentional.

## 17. Common Failure Modes

### Market page loads for a long time

Check:

- Does disk cache exist at `<baseDir>/cache/market-next-index.json`?
- Does UI show `loading: true` or cached payload?
- Is `search.endpoint` reachable?
- Is `search.autoRoute` enabled?
- Which endpoint won route selection?
- Does debug show high `request` time?
- Are all fallbacks failing?

Likely causes:

- Cold start without disk cache.
- Slow primary endpoint.
- Proxy config not usable.
- Endpoint does not serve compressed response.
- Browser is spending time sorting/filtering after data arrives.

Expected good weak-network behavior:

- If cache exists, page should show cached data first.
- Background refresh can take seconds without blocking list operations.
- Stale warning should be shown as page element, not only transient message.

### Refresh feels like it did nothing

Expected:

- Button spins while refresh is in progress.
- Message says request submitted/started.
- Existing list remains usable.
- Success message appears after background refresh completion.
- Debug panel updates `refresh` phase.

If this does not happen:

- Check `client/index.ts` market refresh feedback watcher.
- Check `MarketProvider.refreshInBackground()`.
- Check `notifyMarketRefresh()`.

### Market shows official registry despite default t4wefan source

This can happen if:

- Configured primary is slow or failed.
- Fallback route race selected official registry for this request.

It should not mean config was rewritten.

Check:

- Debug `preferredEndpoint`
- Debug `endpoint`
- Debug `fallbackReason`
- Route score list

### Cache seems stale

Cache is intentionally used for first screen.

Freshness is maintained by:

- background refresh
- ETag validation
- Last-Modified validation
- hash validation
- cache replacement on successful network response

Stale risk exists when network is unavailable for a long time. UI must show cached/stale status clearly.

### Version fetch says failed while still loading

This is a frontend bug.

Rule:

- If `registryStatus[name]?.loading` is true, show loading text.
- Only show failure when `loading` is false and `error`/`reason` exists.

Relevant files:

- `client/components/utils.ts`
- `client/components/package.vue`
- `client/components/install.vue`

### Dependency page is slow

Separate the problem:

- Local dependency snapshot should be fast.
- npm metadata refresh may be slow.
- UI should render local state before metadata completes.

Check:

- `dependency local snapshot ready`
- `npm registry route probe started`
- `npm registry fallback selected`
- `dependency metadata refresh completed`
- per-package registry status loading/error

If all packages are individually slow:

- Check whether route probe selected a bad `metadataEndpoint`.
- Check whether `metadataEndpoint` is being demoted after failures.
- Check configured `registry.endpoint`.
- Check concurrency.

### Installed plugin does not appear in config page

Check:

- Was `market/install` successful?
- Did backend log `created disabled default config entry`?
- Does Koishi config contain `~shortname:xxxx`?
- Is package recognized as plugin by `Scanner.isPlugin(name)`?
- Is `ctx.loader.writable` true?
- Does Console config writer exist?
- Was `config` service refreshed?

Do not "fix" this by enabling plugins automatically. Default must remain disabled.

### `market Cannot convert undefined or null to object`

Usually means frontend code assumed an object exists when the data service has not loaded yet.

Likely sources:

- `Object.keys(config.value.market.override)` when `market` or `override` is missing.
- `Object.values(store.registryStatus)` before initialization.
- `Object.entries(store.registry[name])` when registry metadata is not loaded.

Fix pattern:

- Use `?? {}`.
- Distinguish missing, loading, and error state.
- Avoid destructive UI cleanup based on incomplete data.

## 18. Local Koishi Test Environment

Known local instance path used during development:

```powershell
$instance = 'C:\Users\VE\AppData\Roaming\Koishi\Desktop\data\instances\default'
```

Pack current repo into the Koishi instance:

```powershell
$instance = 'C:\Users\VE\AppData\Roaming\Koishi\Desktop\data\instances\default'
$local = Join-Path $instance '.yarn\local'
New-Item -ItemType Directory -Force -Path $local | Out-Null
npm pack --pack-destination $local
```

Install the local tarball in the instance:

```powershell
cd 'C:\Users\VE\AppData\Roaming\Koishi\Desktop\data\instances\default'
yarn add koishi-plugin-market-next@file:.yarn/local/koishi-plugin-market-next-<version>.tgz
```

Common environment warning:

```text
@koishijs/boilerplate@workspace:. doesn't provide @koishijs/core ...
```

This has appeared as local environment noise before. Do not assume it is caused by market-next unless a concrete runtime failure points to this plugin.

Manual validation checklist:

- Open `/market`.
- Confirm cached first screen if cache exists.
- Confirm background refresh message/debug.
- Search common terms:
  - `onebot`
  - `chatluna`
  - `markdown`
- Toggle categories and clear filters.
- Ctrl/Cmd+K focuses search.
- Install a small plugin such as `echo` or `schedule`.
- Confirm dependency appears in dependency page.
- Confirm disabled plugin config entry appears in config page.
- Confirm it is disabled by default.
- Confirm pending remove remains visible until apply.
- Refresh dependencies and watch npm route logs.

## 19. CI Workflow

File:

- `.github/workflows/ci.yml`

Trigger:

- push to any branch
- pull request
- tags ignored

Current job:

- checkout
- setup Node.js
- `npm ci`
- `npm run audit:package`
- `npm run audit:high`
- `npm run build`
- `npm run check:package`

Purpose:

- Verify repository is buildable and packageable.
- Do not publish npm.

If CI fails:

- Fix code/docs/package metadata before releasing.
- Do not bypass by publishing manually unless user explicitly accepts the risk.

## 20. Publish Workflow

File:

- `.github/workflows/publish.yml`

Triggers:

- push tag matching `v*`
- manual `workflow_dispatch`

Authentication:

- npm Trusted Publishing.
- No `NPM_TOKEN`.

Workflow checks:

- On tag push:
  - tag version without leading `v` must equal `package.json` version.
- On manual dispatch:
  - must run on default branch.
  - input version must equal `package.json` version.
- npm must not already contain the same package version.
- dist-tag is derived from prerelease suffix:
  - `3.5.6-alpha.4` -> `alpha`
  - normal release -> `latest`

Publish command:

```bash
npm publish --tag "${NPM_DIST_TAG}"
```

If Trusted Publishing is not configured, the workflow should fail at publish authentication after build/checks pass.

## 21. Release Discipline

Hard rule: do not tag before docs and changelog are committed.

Correct release order:

1. Finish code changes.
2. Update `package.json` version.
3. Update `package-lock.json` version.
4. Update `CHANGELOG.md`.
5. Update `README.md` release notes or alpha notes if relevant.
6. Run local verification:

```powershell
npm ci
npm run build
npm run check:package
npm pack --dry-run
npm run audit:package
npm run audit:high
```

7. Commit all release changes.
8. Push `master`.
9. Create tag:

```powershell
git tag vX.Y.Z
```

10. Push tag:

```powershell
git push origin vX.Y.Z
```

11. Watch GitHub Actions publish workflow.
12. Verify npm:

```powershell
npm view koishi-plugin-market-next@X.Y.Z version dist-tags --json
```

Never:

- Do not push a release tag before updating `CHANGELOG.md`.
- Do not rely on "fix docs after release" for release notes.
- Do not manually publish from local npm unless GitHub Actions is broken and the user explicitly asks for a manual emergency release.
- Do not use `npm audit fix --force` if it downgrades Koishi/Console dependency ranges against project requirements.

## 22. Git And Branch Discipline

Current default branch:

- `master`

Git identity should be:

```text
qinfeng365
111269552+qinfeng365@users.noreply.github.com
```

Check before committing:

```powershell
git config user.name
git config user.email
git status --short --branch
```

Before pushing:

```powershell
git log --oneline -5
git status --short --branch
```

If user asks to "传 master":

- Commit changes on `master`.
- Push `origin master`.
- Do not create tag unless release requested.
- Do not publish npm unless release requested.

If user asks to "发版" or "发 npm":

- Confirm version already updated.
- Confirm changelog already updated.
- Push commit.
- Push matching `v*` tag.
- Let GitHub Actions publish.

## 23. Security And Audit Policy

Audit commands:

```powershell
npm run audit:package
npm run audit:high
```

Policy:

- Prioritize high severity vulnerabilities in this package's direct publish dependency tree.
- Treat optional peer runtime audit noise separately from market-next's own shipped dependency tree.
- Do not downgrade Koishi Console or Koishi runtime dependencies just to silence audit if that breaks current plugin compatibility.
- If a risk comes from optional ChatLuna tool dependencies:
  - try safe upgrades first,
  - keep delayed/optional loading,
  - document risk boundary in README/CHANGELOG if unresolved.

## 24. Development Rules For This Repository

General:

- Prefer existing patterns over new abstractions.
- Keep backend and frontend API compatibility unless explicitly changing public interface.
- Preserve weak-network behavior when changing market loading.
- Preserve disabled-by-default plugin config creation.
- Preserve config separation between market index source and npm registry source.
- Do not write persistent config from route decisions.
- Do not make ChatLuna tool perform mutations.

Backend:

- Keep long operations cancellable/stale-safe through serial checks.
- Avoid clearing usable payloads before a new network result exists.
- Keep `ctx.scope.isActive` checks in background tasks.
- Keep timers cleaned up through `ctx.effect`.
- Preserve Console refresh calls when backend state changes.

Frontend:

- Treat all store data as possibly undefined during startup.
- Distinguish loading, stale, error, cached, and ready.
- Avoid blocking global UI for background refresh.
- For dependency page, keep pending changes visible until applied.
- For 100+ dependencies, reduce visual noise before adding more text.
- For market page, protect sort/filter and virtual list performance.

Docs:

- Update README when user-visible behavior changes.
- Update CHANGELOG before any release tag.
- Keep this handoff updated when architecture or release process changes.

## 25. High-Risk Change Areas

MarketProvider cache and refresh:

- Small changes can reintroduce blocking startup.
- Validate cold start, warm cache, refresh failure, and fallback route.

Installer route logic:

- Easy to accidentally make every package race every registry.
- Desired behavior is one representative route probe, then reuse selected metadata endpoint with demotion on failures.

Config auto-completion:

- Easy to accidentally auto-enable plugins.
- Desired behavior is disabled entries only.

Dependency override cleanup:

- Easy to remove pending uninstall rows too early.
- Desired behavior is keep pending state until real dependency data confirms completion.

Frontend store assumptions:

- Koishi Console data services can arrive in different order.
- Always guard optional objects.

Release workflow:

- Tag/version mismatch fails publish.
- Missing changelog before tag is a process failure even if npm publish succeeds.

## 26. Suggested Future Work

These are not commitments; they are practical next candidates.

Weak-network UX:

- Add clearer "using cached first screen, validating in background" language.
- Expose last successful source and validation age in a compact status bar.
- Consider a hard refresh action only if users explicitly need "discard cache and force network".

Market performance:

- Continue measuring parse, payload, frontend sort/filter, and virtual rendering separately.
- Consider worker-based parse only if JSON parse becomes the dominant cost on low-end devices.
- Avoid adding heavy per-card computed work.

Dependency metadata:

- Improve npm registry route demotion when selected endpoint becomes slow.
- Expose route probe result in dependency page debug UI if users keep reporting slow refresh.
- Keep no-cache policy for dependency metadata unless requirements change.

Dependency UI:

- Continue reducing ordinary installed-card noise.
- Add better grouping collapse only if users need it; avoid hiding important pending/error states.

ChatLuna:

- Add targeted test harness for tool input normalization and JSON output.
- Keep registration diagnostics visible enough for support.

Testing:

- Add small pure-function tests for market search matching and ChatLuna normalization if test infrastructure is introduced.
- Add route strategy unit tests if backend logic becomes more complex.

## 27. Quick Command Reference

Status:

```powershell
git status --short --branch
git log --oneline -5
```

Install:

```powershell
npm ci
```

Build/check:

```powershell
npm run build
npm run check:package
npm pack --dry-run
```

Audit:

```powershell
npm run audit:package
npm run audit:high
```

Pack for local Koishi:

```powershell
$instance = 'C:\Users\VE\AppData\Roaming\Koishi\Desktop\data\instances\default'
$local = Join-Path $instance '.yarn\local'
New-Item -ItemType Directory -Force -Path $local | Out-Null
npm pack --pack-destination $local
```

Push docs/code without release:

```powershell
git add .
git commit -m "docs: add developer handoff"
git push origin master
```

Release through GitHub Actions:

```powershell
git tag vX.Y.Z
git push origin vX.Y.Z
```

Verify npm:

```powershell
npm view koishi-plugin-market-next@X.Y.Z version dist-tags --json
```

## 28. Final Maintainer Checklist

Before ending any implementation task:

- Source changes are scoped to the request.
- Generated artifacts are rebuilt when source changes require it.
- `npm run build` passes for code changes.
- `npm run check:package` passes before release.
- README is updated for user-facing behavior changes.
- CHANGELOG is updated before release.
- Version and lockfile are synchronized before release.
- No release tag is pushed before docs/changelog.
- No npm publish is attempted unless explicitly requested.
- Local Koishi test is used for UI/runtime-sensitive changes.
- Weak-network cache/route behavior is not regressed.
- Newly installed plugins appear in config page as disabled entries.
