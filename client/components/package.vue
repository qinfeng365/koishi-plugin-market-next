<template>
  <article :class="['dep-item', listMode ? 'is-row' : 'is-card', `is-${statusClass}`]">
    <div class="dep-icon" aria-hidden="true">
      <market-icon :name="icon"></market-icon>
    </div>

    <div class="dep-main">
      <div class="dep-title">
        <h3 :title="name">
          <a v-if="titleLink" :href="titleLink" :title="titleLink" target="_blank" rel="noopener noreferrer">{{ displayName }}</a>
          <template v-else>{{ displayName }}</template>
        </h3>
        <span v-if="showTag" :class="['dep-tag', `is-${statusClass}`]">{{ statusLabel }}</span>
      </div>
      <a v-if="displayName !== name && npmLink" class="dep-name" :href="npmLink" :title="npmLink" target="_blank" rel="noopener noreferrer">{{ name }}</a>
      <span v-else-if="displayName !== name" class="dep-name" :title="name">{{ name }}</span>
      <!-- Rendered even when empty so every card has the same height. -->
      <p v-if="!listMode" class="dep-summary" :title="summaryText">{{ summaryText }}</p>
    </div>

    <p v-if="listMode && summaryText" class="dep-summary" :title="summaryText">{{ summaryText }}</p>

    <!-- The picker takes the place of the target version, so the row keeps its shape while editing. -->
    <div class="dep-version" :title="versionTitle">
      <span>{{ currentText }}</span>
      <template v-if="showPicker">
        <span class="dep-arrow">→</span>
        <version-picker
          v-model="selectedVersion"
          :versions="data"
          :current="dep?.resolved"
          :latest="latestVersion"
          :removable="!!dep"
          :pending="pending"
          :placeholder="t('dependencyCard.picker.placeholder')"
          :remove-value="removeValue"
        ></version-picker>
      </template>
      <template v-else-if="showTarget">
        <span class="dep-arrow">→</span>
        <strong :class="{ 'is-remove': pendingRemove }">{{ targetText }}</strong>
      </template>
      <span v-if="showVersionControl && !hasVersions" class="dep-muted">{{ compactStatusText }}</span>
    </div>

    <p v-if="showDetailText" :class="['dep-detail', { 'is-danger': statusClass === 'error' }]">{{ detailText }}</p>

    <div v-if="showActions" class="dep-actions">
      <el-button v-if="pending" size="small" @click="clearOverride">{{ t('dependencyCard.actions.undo') }}</el-button>
      <el-button v-if="showQuickUpdate" size="small" type="primary" @click="selectedVersion = latestVersion">
        {{ t('dependencyCard.actions.update') }}
      </el-button>
      <el-button v-if="showConfigure" size="small" type="primary" :loading="configuring" @click="configure">
        {{ t('dependencyCard.actions.addConfig') }}
      </el-button>
      <el-button v-if="showBindLocal" size="small" type="primary" :loading="bindingLocalPackages.has(name)" @click="Object.assign(dependencyDialog, { type: 'local-binding', name })">
        {{ t('dependencyCard.actions.bindLocal') }}
      </el-button>
      <el-button v-if="showRestoreUpdate" size="small" @click="restoreUpdate">{{ t('dependencyCard.actions.restorePrompt') }}</el-button>
      <el-button v-if="showManageBundle" size="small" @click="openBundlePanel">{{ t('dependencyCard.actions.manage') }}</el-button>
    </div>

    <!-- The menu itself is shared by all cards, see dependency-menu.vue. -->
    <div v-if="menuItems.length" ref="menuAnchor" class="dep-menu">
      <el-button
        size="small"
        class="dep-more"
        :title="t('dependencyCard.actions.more')"
        :aria-label="t('dependencyCard.actions.more')"
        aria-haspopup="menu"
        :aria-expanded="String(menuOpen)"
        @click="toggleMenu"
      >
        <k-icon name="activity:ellipsis"></k-icon>
      </el-button>
    </div>
  </article>
</template>

<script lang="ts" setup>
import { useDependency, type DependencyProps } from '../composables/use-dependency'
import MarketIcon from '../market/icons'
import VersionPicker from './version-picker.vue'

const props = defineProps<DependencyProps>()
const {
  t,
  removeValue,
  configuring,
  menuAnchor,
  menuOpen,
  dep,
  displayName,
  npmLink,
  titleLink,
  icon,
  hasVersions,
  data,
  latestVersion,
  pending,
  pendingRemove,
  selectedVersion,
  statusClass,
  statusLabel,
  currentText,
  showTarget,
  targetText,
  versionTitle,
  detailText,
  compactStatusText,
  summaryText,
  showTag,
  showDetailText,
  showVersionControl,
  showPicker,
  showManageBundle,
  showQuickUpdate,
  showRestoreUpdate,
  showConfigure,
  showBindLocal,
  menuItems,
  showActions,
  toggleMenu,
  openBundlePanel,
  clearOverride,
  restoreUpdate,
  configure,
  bindingLocalPackages,
  dependencyDialog,
} = useDependency(props)
</script>

<style lang="scss" scoped>

.dep-item {
  min-width: 0;
  box-sizing: border-box;
  background: var(--k-card-bg);
}

.dep-icon {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 6px;
  color: var(--fg2);
  background: var(--k-side-bg);

  .market-icon {
    width: 1rem;
    height: 1rem;
  }
}

.dep-main {
  min-width: 0;
}

.dep-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;

  h3 {
    margin: 0;
    min-width: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    a {
      color: inherit;
      text-decoration: none;
    }
  }
}

.dep-title h3 a:hover,
a.dep-name:hover {
  color: var(--k-color-primary);
  text-decoration: underline;
}

.dep-tag {
  flex: 0 0 auto;
  border-radius: 4px;
  padding: 0 0.375rem;
  color: var(--fg2);
  background: var(--k-side-bg);
  font-size: 0.75rem;
  line-height: 1.25rem;
  white-space: nowrap;

  &.is-pending,
  &.is-manual {
    color: var(--k-color-primary);
    background: color-mix(in srgb, var(--k-color-primary) 12%, transparent);
  }

  &.is-updatable {
    color: var(--k-color-success);
    background: color-mix(in srgb, var(--k-color-success) 12%, transparent);
  }

  &.is-error {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }

  &.is-unconfigured,
  &.is-invalid,
  &.is-local {
    color: var(--warning);
    background: color-mix(in srgb, var(--warning) 12%, transparent);
  }
}

.dep-name {
  display: block;
  width: fit-content;
  max-width: 100%;
  text-decoration: none;
  color: var(--fg3);
  font-size: 0.8125rem;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dep-summary {
  margin: 0;
  color: var(--fg2);
  font-size: 0.8125rem;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dep-version {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.375rem;
  min-width: 0;
  color: var(--fg2);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;

  > span,
  strong {
    white-space: nowrap;
  }

  strong {
    color: var(--fg1);
    font-weight: 600;
  }

  .dep-arrow {
    color: var(--fg3);
  }

  .is-remove {
    color: var(--danger);
  }
}

.is-updatable .dep-version strong {
  color: var(--k-color-success);
}

.is-pending .dep-version strong:not(.is-remove) {
  color: var(--k-color-primary);
}

.dep-detail {
  margin: 0;
  color: var(--fg2);
  font-size: 0.8125rem;
  line-height: 1.5;
  overflow-wrap: anywhere;

  &.is-danger {
    color: var(--danger);
  }
}

.dep-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;

  .el-button + .el-button {
    margin-left: 0;
  }
}

.dep-muted {
  color: var(--fg3);
  font-size: 0.8125rem;
}

.dep-more {
  padding: 0 0.5rem;

  .k-icon {
    width: 1rem;
    height: 1rem;
  }
}

.dep-icon { grid-area: icon; }
.dep-main { grid-area: main; }
.dep-version { grid-area: version; }
.dep-detail { grid-area: detail; }
.dep-actions { grid-area: actions; }
.dep-menu {
  grid-area: menu;
  justify-self: end;
}

.is-row > .dep-summary { grid-area: summary; }

.is-card .dep-summary {
  min-height: 1.5em;
  margin-top: 0.25rem;
}

@mixin card-layout {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) auto;
  grid-template-areas:
    'icon main menu'
    'icon version actions'
    'icon detail detail';
  column-gap: 0.75rem;
  align-content: start;
  align-items: center;
  padding: 0.75rem 0.875rem;

  .dep-icon,
  .dep-menu {
    align-self: start;
  }

  // Empty grid rows would still add a gap, so spacing goes on the items.
  .dep-version,
  .dep-actions,
  .dep-detail {
    margin-top: 0.375rem;
  }
}

.is-card {
  @include card-layout;
  border: 1px solid var(--k-color-border);
  border-radius: 8px;
}

// Fixed columns keep versions and buttons aligned from row to row.
.is-row {
  display: grid;
  grid-template-columns: 2rem minmax(10rem, 2fr) minmax(0, 3fr) 14rem 7rem 2.25rem;
  // The icon spans both rows; without a minimum, a one-line title leaves its extra height
  // to the empty detail row and sits above center. 2.5rem matches a title plus package name.
  grid-template-rows: minmax(2.5rem, auto) auto;
  grid-template-areas:
    'icon main summary version actions menu'
    'icon detail detail detail detail detail';
  column-gap: 1rem;
  align-items: center;
  padding: 0.5rem 1rem;

  > .dep-summary {
    color: var(--fg3);
  }

  .dep-version {
    flex-wrap: nowrap;
  }

  .dep-detail {
    margin-top: 0.125rem;
  }

  // Without a menu, the buttons take its column so the row doesn't end in a gap.
  .dep-actions:last-child {
    grid-column: actions / -1;
  }
}

@media (max-width: 768px) {
  .is-row {
    @include card-layout;

    > .dep-summary {
      display: none;
    }

    .dep-actions:last-child {
      grid-area: actions;
    }
  }
}

</style>
