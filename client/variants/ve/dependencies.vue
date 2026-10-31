<template>
  <k-layout main="page-deps" :class="['page-dependencies', 'deps-ui-ve', `deps-layout-${depsLayout}`]" menu="dependencies">
    <div class="deps-toolbar">
      <div class="deps-toolbar-row">
        <el-select v-model="filter" size="small" class="deps-filter-select" popper-class="deps-ui-ve" :aria-label="t('dependencies.toolbar.filter')">
          <el-option
            v-for="option in filterOptions"
            :key="option.value"
            :value="option.value"
            :label="option.label + (option.count ? ' (' + option.count + ')' : '')"
          >
            <span class="deps-filter-option">
              <k-icon v-if="option.icon.startsWith('market-next:')" :name="option.icon"></k-icon>
              <market-icon v-else :name="option.icon"></market-icon>
              <span>{{ option.label }}</span>
              <span v-if="option.count" class="deps-filter-count">({{ option.count }})</span>
            </span>
          </el-option>
        </el-select>
        <button
          :class="['deps-filter', 'deps-prerelease-toggle', { active: prereleaseBlocked }]"
          :title="t('dependencies.toolbar.blockPreview')"
          :aria-label="t('dependencies.toolbar.blockPreview')"
          :aria-pressed="String(prereleaseBlocked)"
          @click="togglePrereleaseFilter"
        >
          <market-icon name="tag"></market-icon>
          <span>{{ t('dependencies.toolbar.blockPreview') }}</span>
        </button>
        <button
          class="deps-filter deps-layout-toggle"
          :aria-pressed="String(depsLayout === 'list')"
          :aria-label="depsLayout === 'grid' ? t('dependencies.toolbar.listView') : t('dependencies.toolbar.gridView')"
          @click="setLayout(depsLayout === 'grid' ? 'list' : 'grid')"
          :title="depsLayout === 'grid' ? t('dependencies.toolbar.listView') : t('dependencies.toolbar.gridView')"
        >
          <svg v-if="depsLayout === 'grid'" viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="currentColor">
            <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="currentColor">
            <path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/>
          </svg>
          <span>{{ depsLayout === 'grid' ? t('dependencies.toolbar.listView') : t('dependencies.toolbar.gridView') }}</span>
        </button>
        <div class="deps-search">
          <el-input
            ref="searchInput"
            v-model="keyword"
            clearable
            :placeholder="t('dependencies.toolbar.searchPlaceholder')"
            @keydown.esc="keyword = ''"
          ></el-input>
        </div>
      </div>
      <div
        v-if="dependencyLoading"
        class="deps-loading"
        role="progressbar"
        :aria-label="t('dependencies.toolbar.loading')"
      ></div>
    </div>

    <el-scrollbar class="body-container" :aria-busy="String(dependencyLoading)">
      <div class="deps-content">
        <template v-if="visibleGroups.length">
          <section v-for="group in visibleGroups" :key="group.key" :class="['deps-group', group.key, { collapsed: group.collapsed }]">
            <header
              :class="['deps-group-header', { collapsible: group.collapsible }]"
              :role="group.collapsible ? 'button' : undefined"
              :tabindex="group.collapsible ? 0 : undefined"
              :aria-expanded="group.collapsible ? String(!group.collapsed) : undefined"
              @click="group.collapsible && toggleGroup(group.key)"
              @keydown.enter.prevent="group.collapsible && toggleGroup(group.key)"
              @keydown.space.prevent="group.collapsible && toggleGroup(group.key)"
            >
              <svg
                v-if="group.collapsible"
                :class="['deps-group-chevron', { collapsed: group.collapsed }]"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <div class="deps-group-heading">
                <h2>
                  <k-icon v-if="group.icon.startsWith('market-next:')" :name="group.icon"></k-icon>
                  <market-icon v-else :name="group.icon"></market-icon>
                  <span>{{ group.label }}</span>
                  <span class="deps-group-count">{{ group.items.length }}</span>
                </h2>
                <p>{{ group.description }}</p>
              </div>
            </header>
            <div v-if="!group.collapsed" class="deps-grid">
              <template v-if="depsLayout === 'list'">
                <div class="deps-list-header">
                  <span class="col-icon"></span>
                  <span class="col-name">{{ t('dependencies.columns.name') }}</span>
                  <span class="col-version">{{ t('dependencies.columns.current') }}</span>
                  <span class="col-latest">{{ t('dependencies.columns.latest') }}</span>
                  <span class="col-actions">{{ t('dependencies.columns.actions') }}</span>
                </div>
              </template>
              <package-view
                v-for="item in group.items"
                :key="item.name"
                :name="item.name"
                :kind="item.kind"
                :list-mode="depsLayout === 'list'"
              ></package-view>
            </div>
          </section>
        </template>
        <empty-state v-else icon="market-next:search-empty" :title="t('dependencies.empty')" :description="t('dependencies.emptyHint')">
          <el-button v-if="filter !== 'all' || keyword.trim()" size="small" @click="clearFilters">
            {{ t('dependencies.toolbar.clearFilters') }}
          </el-button>
        </empty-state>
      </div>
    </el-scrollbar>

    <div v-if="summary.pending" class="deps-apply-bar">
      <div role="status">
        <strong>{{ t('dependencies.apply.count', { count: summary.pending }) }}</strong>
        <span>{{ t('dependencies.apply.description') }}</span>
      </div>
      <div class="deps-apply-actions">
        <el-button @click="clearChanges">{{ t('dependencies.apply.discard') }}</el-button>
        <el-button type="primary" @click="showConfirm = true">{{ t('dependencies.apply.apply') }}</el-button>
      </div>
    </div>
  </k-layout>

  <manual-install/>
  <dependency-dialogs/>
  <dependency-menu/>
</template>

<script lang="ts" setup>
import { useDependencies } from '../../composables/use-dependencies'
import ManualInstall from '../../components/manual.vue'
import DependencyDialogs from '../../components/dependency-dialogs.vue'
import DependencyMenu from '../../components/dependency-menu.vue'
import PackageView from './package.vue'
import EmptyState from '../../components/empty-state.vue'
import MarketIcon from '../../market/icons'

const { t, keyword, filter, searchInput, depsLayout, prereleaseBlocked, filterOptions, visibleGroups, toggleGroup, summary, clearChanges, setLayout, togglePrereleaseFilter, showConfirm, dependencyLoading } = useDependencies()

function clearFilters() {
  filter.value = 'all'
  keyword.value = ''
}
</script>

<style lang="scss">
// 依赖管理页：中性表面、发丝边界，状态色只用于图标、徽标与数值。

@mixin deps-tokens {
  --deps-canvas: color-mix(in srgb, var(--k-main-bg) 94%, var(--fg1) 6%);
  --deps-surface: var(--k-card-bg);
  --deps-line: color-mix(in srgb, var(--fg1) 10%, transparent);
  --deps-line-soft: color-mix(in srgb, var(--fg1) 6%, transparent);
  --deps-line-strong: color-mix(in srgb, var(--fg1) 20%, transparent);
  --deps-hover: color-mix(in srgb, var(--fg1) 4%, transparent);
  --deps-active: color-mix(in srgb, var(--fg1) 7%, transparent);
  --deps-text: var(--fg1);
  --deps-text-2: color-mix(in srgb, var(--fg1) 76%, var(--k-main-bg));
  --deps-text-3: color-mix(in srgb, var(--fg1) 68%, var(--k-main-bg));
  --deps-radius: 8px;
  --deps-ease: cubic-bezier(0.2, 0.7, 0.3, 1);
  --deps-accent: var(--fg1);
}

.deps-ui-ve {
  .page-deps {
    @include deps-tokens;

    display: flex;
    flex-flow: column;
    min-height: 0;
    background: var(--deps-canvas);
    color: var(--deps-text);

    .body-container {
      flex: 1 1 auto;
      min-height: 0;
    }

    .k-empty {
      flex: 1 1 auto;
      height: auto;
      min-height: 22rem;
      margin-top: 0;
      gap: 0.75rem;
      color: var(--deps-text-2);

      p {
        margin: 0;
      }

      .image {
        width: 7rem;
        color: color-mix(in srgb, var(--fg1) 6%, transparent);
      }

      .el-button {
        margin-top: 0.25rem;
      }
    }
  }

  .deps-apply-bar {
    @include deps-tokens;
  }

  // 暗色下使用控制台主背景，避免画布比卡片更亮。
  html.dark & .page-deps,
  .theme-root.dark & .page-deps {
    --deps-canvas: var(--k-main-bg);
  }

  // ---------------------------------------------------------------------------
  // 工具栏

  .deps-toolbar {
    position: relative;
    flex: 0 0 auto;
    padding: 0.6rem var(--card-margin);
    background: var(--deps-canvas);
    border-bottom: 1px solid var(--deps-line);
  }

  .deps-loading {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    overflow: hidden;
    pointer-events: none;

    &::after {
      content: '';
      display: block;
      width: 35%;
      height: 100%;
      border-radius: 999px;
      background: color-mix(in srgb, var(--k-color-primary) 55%, transparent);
      animation: deps-loading 1.1s var(--deps-ease) infinite;
    }
  }

  .deps-toolbar-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
  }

  .deps-filter-select {
    flex: 0 1 auto;
    width: auto;
    min-width: 8.5rem;
    max-width: 13rem;
  }

  .deps-search {
    flex: 1 1 auto;
    min-width: 0;
  }

  .deps-search .el-input__wrapper,
  .deps-filter-select .el-select__wrapper {
    border-radius: 8px;
    background: var(--deps-surface);
    box-shadow: 0 0 0 1px var(--deps-line-strong) inset !important;
    transition: box-shadow 120ms var(--deps-ease), background 120ms var(--deps-ease);

    &:hover {
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--fg1) 30%, transparent) inset !important;
    }

    &.is-focused,
    &.is-focus {
      background: var(--deps-surface);
      box-shadow:
        0 0 0 1px var(--k-color-primary) inset,
        0 0 0 3px color-mix(in srgb, var(--k-color-primary) 14%, transparent) !important;
    }
  }

  .deps-filter {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    height: 2rem;
    padding: 0 0.6rem;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--deps-text-2);
    font-size: 0.8rem;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition: color 120ms var(--deps-ease), background 120ms var(--deps-ease), border-color 120ms var(--deps-ease);

    .market-icon,
    svg {
      width: 0.9rem;
      height: 0.9rem;
      flex: 0 0 auto;
    }

    &:hover {
      color: var(--deps-text);
      background: var(--deps-hover);
    }

    &:active {
      background: var(--deps-active);
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--k-color-primary) 45%, transparent);
      outline-offset: 1px;
    }

    &.active {
      color: color-mix(in srgb, var(--k-color-primary) 72%, var(--deps-text));
      border-color: color-mix(in srgb, var(--k-color-primary) 26%, transparent);
      background: color-mix(in srgb, var(--k-color-primary) 9%, transparent);
    }
  }

  .deps-layout-toggle svg {
    width: 1rem;
    height: 1rem;
  }

  .deps-filter-option {
    display: inline-flex;
    align-items: center;
    gap: 0.38rem;
    min-width: 0;

    .market-icon {
      width: 0.9rem;
      height: 0.9rem;
      flex: 0 0 auto;
      color: color-mix(in srgb, var(--k-color-primary) 55%, var(--fg2));
    }

    span:not(.deps-filter-count) {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .deps-filter-count {
    color: var(--deps-text-3);
    font-variant-numeric: tabular-nums;
  }

  // ---------------------------------------------------------------------------
  // 内容与分组

  .deps-content {
    padding: 1rem var(--card-margin) var(--card-margin);
  }

  .deps-group {
    --deps-accent: var(--fg1);
    // Resolve derived colors on the group so its status accent takes effect.
    --deps-accent-text: color-mix(in srgb, var(--deps-accent) 52%, var(--fg1));
    --deps-accent-soft: color-mix(in srgb, var(--deps-accent) 11%, transparent);

    &.pending,
    &.manual {
      --deps-accent: var(--k-color-primary);
    }

    &.bundle {
      --deps-accent: var(--k-color-primary);
    }

    &.updatable {
      --deps-accent: var(--k-color-success);
    }

    &.unconfigured,
    &.local,
    &.workspace,
    &.invalid {
      --deps-accent: var(--k-color-warning);
    }

    &.error {
      --deps-accent: var(--k-color-danger);
    }
  }

  .deps-group + .deps-group {
    margin-top: 1.1rem;
    padding-top: 1.1rem;
    border-top: 1px solid var(--deps-line);
  }

  .deps-group.collapsed .deps-group-header {
    margin-bottom: 0;
  }

  .deps-group-header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.55rem;
    min-height: 2.2rem;
    margin: 0 0 0.5rem;
    padding: 0.2rem 0.45rem;
    border-radius: 8px;
    background: transparent;
    transition: background 120ms var(--deps-ease);

    &.collapsible {
      cursor: pointer;
      user-select: none;
    }

    &.collapsible:hover {
      background: var(--deps-hover);
    }

    &.collapsible:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--k-color-primary) 45%, transparent);
      outline-offset: 1px;
      background: var(--deps-hover);
    }

    .deps-group-heading {
      flex: 1 1 auto;
      display: flex;
      align-items: baseline;
      gap: 0.6rem;
      min-width: 0;
    }

    h2 {
      display: inline-flex;
      align-items: center;
      gap: 0.42rem;
      margin: 0;
      flex: 0 0 auto;
      color: var(--deps-text);
      font-size: 0.9rem;
      font-weight: 600;
      line-height: 1.4;

      .market-icon,
      .k-icon {
        width: 0.95rem;
        height: 0.95rem;
        flex: 0 0 auto;
        color: var(--deps-accent-text);
      }
    }

    p {
      flex: 1 1 auto;
      margin: 0;
      min-width: 0;
      color: var(--deps-text-3);
      font-size: 0.76rem;
      line-height: 1.5;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .deps-group-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.2rem;
      height: 1.15rem;
      padding: 0 0.35rem;
      margin-left: 0.1rem;
      border-radius: 999px;
      background: var(--deps-hover);
      color: var(--deps-text-2);
      font-size: 0.7rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }

    .deps-group-chevron {
      width: 0.85rem;
      height: 0.85rem;
      flex: 0 0 auto;
      color: var(--deps-text-3);
      transform: rotate(0deg);
      transition: transform 160ms var(--deps-ease), color 120ms var(--deps-ease);

      &.collapsed {
        transform: rotate(-90deg);
      }
    }

    &:hover .deps-group-chevron {
      color: var(--deps-text-2);
    }
  }

  .deps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr));
    align-items: start;
    gap: 0.6rem;
  }

  // ---------------------------------------------------------------------------
  // 列表模式

  &.deps-layout-list .deps-grid {
    --deps-list-columns: 1.8rem minmax(0, 1fr) 7rem 8rem 24rem;

    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--deps-line);
    border-radius: var(--deps-radius);
    background: var(--deps-surface);
    overflow: hidden;
  }

  .deps-list-header {
    position: sticky;
    top: 0;
    z-index: 2;
    display: grid;
    grid-template-columns: var(--deps-list-columns);
    column-gap: 0.6rem;
    align-items: center;
    width: 100%;
    box-sizing: border-box;
    padding: 0.42rem 0.75rem;
    background: color-mix(in srgb, var(--deps-surface) 92%, var(--fg1) 8%);
    border-bottom: 1px solid var(--deps-line);
    color: var(--deps-text-3);
    font-size: 0.66rem;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: uppercase;

    .col-icon {
      width: 2rem;
    }

    .col-name {
      min-width: 0;
    }

    .col-version,
    .col-latest {
      min-width: 0;
      padding: 0 0.25rem;
    }

    .col-actions {
      min-width: 0;
      text-align: right;
    }
  }

  // ---------------------------------------------------------------------------
  // 应用条

  .deps-apply-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.65rem var(--card-margin);
    border-top: 1px solid var(--deps-line);
    background: var(--deps-surface);
    box-shadow: 0 -10px 26px -24px rgb(0 0 0 / 55%);
    color: var(--deps-text);

    strong {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      line-height: 1.4;
      font-variant-numeric: tabular-nums;
    }

    > div > span {
      display: block;
      margin-top: 0.05rem;
      color: var(--deps-text-3);
      font-size: 0.76rem;
      line-height: 1.4;
    }
  }

  .deps-apply-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 0.5rem;

    .el-button {
      margin-left: 0;
      border-radius: 6px;
    }
  }

  // ---------------------------------------------------------------------------
  // 加载动效。

  @keyframes deps-loading {
    from {
      transform: translateX(-100%);
    }

    to {
      transform: translateX(285%);
    }
  }

  // ---------------------------------------------------------------------------
  // 响应式

  @media (max-width: 1100px) {
    .deps-toolbar-row {
      flex-wrap: wrap;
    }

    .deps-search {
      flex: 1 1 12rem;
    }
  }

  @media (max-width: 1100px) {
    &.deps-layout-list .deps-grid {
      --deps-list-columns: 1.8rem minmax(0, 1fr) 5.5rem 6rem 11rem;
    }
  }

  @media (max-width: 768px) {
    .deps-search {
      flex: 1 1 100%;
      order: 5;
    }

    .deps-filter-select {
      flex: 0 1 auto;
      max-width: 13rem;
    }

    .deps-filter-select .el-select__wrapper {
      min-height: 2rem;
    }
  }

  @media (max-width: 768px) {
    &.deps-layout-list .deps-grid {
      border: 0;
      border-radius: 0;
      background: transparent;
      overflow: visible;
    }

    .deps-list-header {
      display: none;
    }
  }

  @media (max-width: 768px) {
    .deps-group-header {
      min-height: 2.6rem;
    }
  }

  @media (max-width: 560px) {
    .deps-group-header {
      .deps-group-heading {
        gap: 0.4rem;
      }

      p {
        display: none;
      }
    }

    .deps-filter span {
      display: none;
    }

    .deps-filter {
      width: 2.5rem;
      height: 2.5rem;
      padding: 0;
    }

    .deps-filter-select {
      flex: 1 1 auto;
      max-width: none;
    }

    .deps-filter-select .el-select__wrapper {
      min-height: 2.5rem;
    }
  }

  @media (max-width: 640px) {
    .deps-apply-bar {
      flex-direction: column;
      align-items: stretch;
      gap: 0.6rem;
    }

    .deps-apply-actions .el-button {
      flex: 1 1 0;
    }
  }

  @media (max-width: 420px) {
    .deps-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page-deps *,
    .deps-apply-bar * {
      animation-duration: 0s !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0s !important;
    }

    .deps-loading::after {
      width: 100%;
      opacity: 0.5;
      animation: none !important;
      transform: none;
    }
  }
}
</style>
