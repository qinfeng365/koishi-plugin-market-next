<template>
  <k-layout main="page-deps" :class="['page-dependencies', `deps-layout-${depsLayout}`]" menu="dependencies">
    <div class="deps-toolbar">
      <el-input
        ref="searchInput"
        v-model="keyword"
        class="deps-search"
        clearable
        :placeholder="t('dependencies.toolbar.searchPlaceholder')"
      >
        <template #prefix><k-icon name="search"></k-icon></template>
      </el-input>
      <el-select v-model="filter" class="deps-filter-select">
        <el-option
          v-for="option in filterOptions"
          :key="option.value"
          :value="option.value"
          :label="option.count ? `${option.label} (${option.count})` : option.label"
        >
          <span class="deps-filter-option">
            <k-icon v-if="option.icon.startsWith('market-next:')" :name="option.icon"></k-icon>
            <market-icon v-else :name="option.icon"></market-icon>
            <span>{{ option.label }}</span>
            <span v-if="option.count" class="deps-filter-count">{{ option.count }}</span>
          </span>
        </el-option>
      </el-select>
      <el-checkbox :model-value="prereleaseBlocked" @change="togglePrereleaseFilter">
        {{ t('dependencies.toolbar.blockPreview') }}
      </el-checkbox>
      <span v-if="dependencyLoading" class="deps-loading">{{ t('dependencies.toolbar.loading') }}</span>
      <div class="deps-layout-switch" role="group" :aria-label="t('dependencies.toolbar.layout')">
        <button
          v-for="mode in (['grid', 'list'] as const)"
          :key="mode"
          :class="{ active: depsLayout === mode }"
          :title="mode === 'grid' ? t('dependencies.toolbar.gridView') : t('dependencies.toolbar.listView')"
          :aria-pressed="depsLayout === mode"
          @click="setLayout(mode)"
        >
          <svg v-if="mode === 'grid'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4 5h16v2H4V5zm0 6h16v2H4v-2zm0 6h16v2H4v-2z"/>
          </svg>
        </button>
      </div>
    </div>

    <el-scrollbar class="body-container">
      <div class="deps-content">
        <template v-if="visibleGroups.length">
          <section v-for="group in visibleGroups" :key="group.key" :class="['deps-group', `is-${group.key}`]">
            <header
              :class="['deps-group-header', { collapsible: group.collapsible }]"
              :role="group.collapsible ? 'button' : undefined"
              :tabindex="group.collapsible ? 0 : undefined"
              :aria-expanded="group.collapsible ? String(!group.collapsed) : undefined"
              @click="group.collapsible && toggleGroup(group.key)"
              @keydown.enter.prevent="group.collapsible && toggleGroup(group.key)"
              @keydown.space.prevent="group.collapsible && toggleGroup(group.key)"
            >
              <k-icon v-if="group.collapsible" :class="['deps-group-chevron', { expanded: !group.collapsed }]" name="chevron-right"></k-icon>
              <h2>{{ group.label }}</h2>
              <span class="deps-group-count">{{ group.items.length }}</span>
              <p>{{ group.description }}</p>
            </header>
            <div v-if="!group.collapsed" :class="depsLayout === 'list' ? 'deps-list' : 'deps-grid'">
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
        <empty-state v-else class="deps-empty" icon="market-next:search-empty" :title="t('dependencies.empty')" :description="t('dependencies.emptyHint')"></empty-state>
      </div>
    </el-scrollbar>

    <div v-if="summary.pending" class="deps-apply-bar">
      <div class="deps-apply-text">
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
import { useDependencies } from '../composables/use-dependencies'
import ManualInstall from './manual.vue'
import DependencyDialogs from './dependency-dialogs.vue'
import DependencyMenu from './dependency-menu.vue'
import PackageView from './package.vue'
import EmptyState from './empty-state.vue'
import MarketIcon from '../market/icons'

const { t, keyword, filter, searchInput, depsLayout, prereleaseBlocked, filterOptions, visibleGroups, toggleGroup, summary, clearChanges, setLayout, togglePrereleaseFilter, showConfirm, dependencyLoading } = useDependencies()
</script>

<style lang="scss">

.page-deps {
  display: flex;
  flex-flow: column;
  min-height: 0;

  .body-container {
    flex: 1 1 auto;
    min-height: 0;
  }
}

.deps-toolbar {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.75rem var(--card-margin);
  border-bottom: 1px solid var(--k-color-divider);

  .el-checkbox {
    margin-right: 0;
  }
}

.deps-search {
  flex: 1 1 16rem;
  min-width: 0;
  max-width: 28rem;
}

.deps-filter-select {
  flex: 0 0 10rem;
}

.deps-filter-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .market-icon,
  .k-icon {
    width: 0.875rem;
    height: 0.875rem;
    color: var(--fg3);
  }
}

.deps-filter-count {
  margin-left: auto;
  padding-left: 1rem;
  color: var(--fg3);
  font-size: 0.8125rem;
}

.deps-empty {
  margin-top: 3rem;
}

.deps-loading {
  color: var(--fg3);
  font-size: 0.875rem;
}

.deps-layout-switch {
  display: inline-flex;
  margin-left: auto;
  border: 1px solid var(--k-color-border);
  border-radius: 4px;
  overflow: hidden;

  button {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 1.875rem;
    border: 0;
    padding: 0;
    color: var(--fg3);
    background: transparent;
    cursor: pointer;

    & + button {
      border-left: 1px solid var(--k-color-border);
    }

    &:hover {
      color: var(--fg1);
    }

    &.active {
      color: var(--k-color-primary);
      background: var(--k-hover-bg);
    }
  }

  svg {
    width: 1rem;
    height: 1rem;
  }
}

.deps-content {
  padding: 1rem var(--card-margin) var(--card-margin);
}

.deps-group + .deps-group {
  margin-top: 1.5rem;
}

.deps-group-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
  margin-bottom: 0.75rem;
  user-select: none;

  &.collapsible {
    cursor: pointer;
  }

  &:focus-visible {
    outline: 2px solid var(--k-color-primary);
    outline-offset: 2px;
    border-radius: 4px;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.5;
  }

  p {
    flex: 1 1 16rem;
    margin: 0;
    color: var(--fg3);
    font-size: 0.8125rem;
    line-height: 1.5;
  }
}

.deps-group-count {
  min-width: 1.25rem;
  border-radius: 10px;
  padding: 0 0.375rem;
  color: var(--fg2);
  background: var(--k-side-bg);
  font-size: 0.75rem;
  line-height: 1.25rem;
  text-align: center;
}

.is-pending .deps-group-count {
  color: var(--k-color-primary);
  background: color-mix(in srgb, var(--k-color-primary) 12%, transparent);
}

.is-updatable .deps-group-count {
  color: var(--k-color-success);
  background: color-mix(in srgb, var(--k-color-success) 12%, transparent);
}

.is-error .deps-group-count {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.deps-group-chevron {
  width: 0.75rem;
  height: 0.75rem;
  color: var(--fg3);
  transition: transform 0.2s ease;

  &.expanded {
    transform: rotate(90deg);
  }
}

.deps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
  align-items: start;
  gap: 0.75rem;
}

// Rows draw their own top divider; the shifted first row hides its divider
// under the container border.
.deps-list {
  border: 1px solid var(--k-color-border);
  border-radius: 8px;
  overflow: hidden;

  > .dep-item {
    margin-top: -1px;
    border-top: 1px solid var(--k-color-divider);
  }
}

.deps-apply-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  padding: 0.75rem var(--card-margin);
  border-top: 1px solid var(--k-color-divider);
  background: var(--k-card-bg);

  .deps-apply-text {
    min-width: 0;
  }

  strong {
    margin-right: 0.5rem;
  }

  span {
    color: var(--fg2);
    font-size: 0.875rem;
  }
}

.deps-apply-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.5rem;

  .el-button + .el-button {
    margin-left: 0;
  }
}

@media (max-width: 768px) {
  .deps-search {
    flex-basis: 100%;
    max-width: none;
  }

  .deps-filter-select {
    flex: 1 1 8rem;
  }

  .deps-layout-switch {
    display: none;
  }

  .deps-group-header p {
    flex-basis: 100%;
  }

  .deps-apply-bar {
    flex-direction: column;
    align-items: stretch;

    strong {
      display: block;
    }
  }

  .deps-apply-actions .el-button {
    flex: 1 1 0;
  }
}

</style>
