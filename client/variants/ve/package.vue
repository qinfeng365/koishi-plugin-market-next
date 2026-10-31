<template>
  <div v-if="listMode" :class="['dep-list-row', statusClass]">
    <div class="dep-status-mark" aria-hidden="true"><market-icon :name="icon"></market-icon></div>
    <div class="col-name">
      <a v-if="titleLink" class="name-display" :href="titleLink" :title="titleLink" target="_blank" rel="noopener noreferrer">{{ displayName }}</a>
      <span v-else class="name-display" :title="name">{{ displayName }}</span>
      <a v-if="npmLink" class="name-full" :href="npmLink" :title="npmLink" target="_blank" rel="noopener noreferrer">{{ name }}</a>
      <span v-else class="name-full" :title="name">{{ name }}</span>
    </div>
    <div class="col-version" :data-label="t('dependencyCard.picker.current')" :title="versionTitle">{{ currentText }}</div>
    <div class="col-latest" :data-label="pending ? t('dependencyCard.picker.target') : t('dependencyCard.picker.latest')" :class="{ 'has-update': updatable, 'pending-val': pending }">
      {{ showTarget ? targetText : latestVersion || compactStatusText }}
    </div>
    <div class="col-actions">
      <version-picker
        v-if="showPicker"
        v-model="selectedVersion"
        :versions="data"
        :current="dep?.resolved"
        :latest="latestVersion"
        :removable="!!dep"
        :pending="pending"
        :remove-value="removeValue"
      ></version-picker>
      <el-button v-if="pending" size="small" @click="clearOverride">{{ t('dependencyCard.actions.undo') }}</el-button>
      <el-button v-if="showQuickUpdate" size="small" type="primary" @click="selectedVersion = latestVersion">{{ t('dependencyCard.actions.update') }}</el-button>
      <el-button v-if="showConfigure" size="small" type="primary" :loading="configuring" @click="configure">{{ t('dependencyCard.actions.addConfig') }}</el-button>
      <el-button v-if="showBindLocal" size="small" type="primary" :loading="bindingLocalPackages.has(name)" @click="Object.assign(dependencyDialog, { type: 'local-binding', name })">{{ t('dependencyCard.actions.bindLocal') }}</el-button>
      <el-button v-if="showRestoreUpdate" size="small" @click="restoreUpdate">{{ t('dependencyCard.actions.restorePrompt') }}</el-button>
      <el-button v-if="showManageBundle" size="small" @click="openBundlePanel">{{ t('dependencyCard.actions.manage') }}</el-button>
      <el-button v-if="menuItems.some(item => item.command === 'history')" size="small" @click="onCommand('history')">{{ t('dependencyCard.actions.history') }}</el-button>
      <el-button v-if="menuItems.some(item => item.command === 'ignore')" size="small" @click="onCommand('ignore')">{{ t('dependencyCard.actions.ignore') }}</el-button>
      <el-button v-if="menuItems.some(item => item.command === 'remove')" size="small" link type="danger" @click="onCommand('remove')">{{ t('dependencyCard.actions.uninstall') }}</el-button>
      <el-button v-if="menuItems.some(item => item.command === 'version')" size="small" text @click="onCommand('version')">{{ editing ? t('dependencyCard.actions.hideVersions') : t('dependencyCard.actions.pickVersion') }}</el-button>
    </div>
  </div>

  <article v-else :class="['dep-package-card', statusClass, { expanded: editing }]">
    <div class="dep-card-header">
      <div class="dep-status-mark" aria-hidden="true"><market-icon :name="icon"></market-icon></div>
      <div class="dep-title">
        <div class="dep-title-line">
          <h3 :title="name">
            <a v-if="titleLink" :href="titleLink" :title="titleLink" target="_blank" rel="noopener noreferrer">{{ displayName }}</a>
            <template v-else>{{ displayName }}</template>
          </h3>
          <span v-if="showTag" :class="['dep-badge', statusClass]">{{ statusLabel }}</span>
        </div>
        <a v-if="npmLink" class="dep-full-name" :href="npmLink" :title="npmLink" target="_blank" rel="noopener noreferrer">{{ name }}</a>
        <span v-else class="dep-full-name" :title="name">{{ name }}</span>
      </div>
    </div>
    <p v-if="summaryText" class="dep-summary-text" :title="summaryText">{{ summaryText }}</p>
    <div class="dep-meta-row" :title="versionTitle">
      <div class="dep-meta-item">
        <span>{{ t('dependencyCard.picker.current') }}</span>
        <strong>{{ currentText }}</strong>
      </div>
      <div v-if="showTarget" class="dep-meta-item">
        <span>{{ pending ? t('dependencyCard.picker.target') : t('dependencyCard.picker.latest') }}</span>
        <strong :class="{ danger: pendingRemove }">{{ targetText }}</strong>
      </div>
    </div>
    <p v-if="showDetailText" :class="['dep-status-text', { danger: statusClass === 'error' }]">{{ detailText }}</p>
    <div v-if="showActions || menuItems.length || showVersionControl" class="dep-card-actions">
      <version-picker
        v-if="showPicker"
        v-model="selectedVersion"
        :versions="data"
        :current="dep?.resolved"
        :latest="latestVersion"
        :removable="!!dep"
        :pending="pending"
        :remove-value="removeValue"
      ></version-picker>
      <span v-else-if="showVersionControl && !hasVersions" class="dep-muted">{{ compactStatusText }}</span>
      <div class="dep-card-buttons">
        <el-button v-if="pending" size="small" @click="clearOverride">{{ t('dependencyCard.actions.undo') }}</el-button>
        <el-button v-if="showQuickUpdate" size="small" type="primary" @click="selectedVersion = latestVersion">{{ t('dependencyCard.actions.update') }}</el-button>
        <el-button v-if="showConfigure" size="small" type="primary" :loading="configuring" @click="configure">{{ t('dependencyCard.actions.addConfig') }}</el-button>
        <el-button v-if="showBindLocal" size="small" type="primary" :loading="bindingLocalPackages.has(name)" @click="Object.assign(dependencyDialog, { type: 'local-binding', name })">{{ t('dependencyCard.actions.bindLocal') }}</el-button>
        <el-button v-if="showRestoreUpdate" size="small" @click="restoreUpdate">{{ t('dependencyCard.actions.restorePrompt') }}</el-button>
        <el-button v-if="showManageBundle" size="small" @click="openBundlePanel">{{ t('dependencyCard.actions.manage') }}</el-button>
        <el-button v-if="menuItems.some(item => item.command === 'history')" size="small" @click="onCommand('history')">{{ t('dependencyCard.actions.history') }}</el-button>
        <el-button v-if="menuItems.some(item => item.command === 'ignore')" size="small" @click="onCommand('ignore')">{{ t('dependencyCard.actions.ignore') }}</el-button>
        <el-button v-if="menuItems.some(item => item.command === 'remove')" size="small" link type="danger" @click="onCommand('remove')">{{ t('dependencyCard.actions.uninstall') }}</el-button>
        <el-button v-if="menuItems.some(item => item.command === 'version')" size="small" text @click="onCommand('version')">{{ editing ? t('dependencyCard.actions.hideVersions') : t('dependencyCard.actions.pickVersion') }}</el-button>
      </div>
    </div>
  </article>
</template>

<script lang="ts" setup>
import { useDependency, type DependencyProps } from '../../composables/use-dependency'
import MarketIcon from '../../market/icons'
import VersionPicker from '../../components/version-picker.vue'

const props = defineProps<DependencyProps>()
const {
  t,
  removeValue,
  configuring,
  editing,
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
  updatable,
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
  onCommand,
  openBundlePanel,
  clearOverride,
  restoreUpdate,
  configure,
  bindingLocalPackages,
  dependencyDialog,
} = useDependency(props)
</script>

<style lang="scss" scoped>
// 依赖条目：卡片与列表行共用一套中性表面与状态色规则。

@mixin dep-tokens {
  --dep-accent: var(--deps-accent, var(--fg3));
  --dep-accent-text: color-mix(in srgb, var(--dep-accent) 52%, var(--deps-text, var(--fg1)));
  --dep-accent-soft: color-mix(in srgb, var(--dep-accent) 11%, transparent);
  --dep-line: var(--deps-line, color-mix(in srgb, var(--fg1) 10%, transparent));
  --dep-line-soft: var(--deps-line-soft, color-mix(in srgb, var(--fg1) 6%, transparent));
  --dep-line-strong: var(--deps-line-strong, color-mix(in srgb, var(--fg1) 20%, transparent));
  --dep-surface: var(--deps-surface, var(--k-card-bg));
  --dep-hover: var(--deps-hover, color-mix(in srgb, var(--fg1) 4%, transparent));
  --dep-text: var(--deps-text, var(--fg1));
  --dep-text-2: var(--deps-text-2, var(--fg2));
  --dep-text-3: var(--deps-text-3, var(--fg3));
  --dep-ease: var(--deps-ease, cubic-bezier(0.2, 0.7, 0.3, 1));
}

// ---------------------------------------------------------------------------
// 卡片

.dep-package-card {
  @include dep-tokens;

  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  border: 1px solid var(--dep-line);
  border-radius: var(--deps-radius, 8px);
  padding: 0.7rem 0.8rem 0.75rem;
  background: var(--dep-surface);
  transition: border-color 120ms var(--dep-ease), box-shadow 120ms var(--dep-ease);

  &:hover {
    border-color: var(--dep-line-strong);
    box-shadow: 0 10px 26px -22px rgb(0 0 0 / 60%);
  }

  &.expandable {
    cursor: pointer;
  }

  &.expanded {
    border-color: var(--dep-line-strong);
    box-shadow: 0 14px 34px -26px rgb(0 0 0 / 65%);

    .dep-full-name {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
      word-break: break-all;
    }
  }

  &.pending,
  &.manual {
    --dep-accent: var(--k-color-primary);
  }

  &.updatable {
    --dep-accent: var(--k-color-success);
  }

  &.error {
    --dep-accent: var(--k-color-danger);
  }

  &.invalid,
  &.unconfigured,
  &.local,
  &.workspace {
    --dep-accent: var(--k-color-warning);
  }

  &.bundle {
    --dep-accent: var(--k-color-primary);
  }

  &.ignored,
  &.check-disabled {
    --dep-accent: var(--fg1);
  }

  .el-button {
    border-radius: 6px;
  }

  .el-button + .el-button {
    margin-left: 0;
  }
}

.dep-package-card a,
.dep-list-row a {
  color: inherit;
  text-decoration: none;

  &:hover {
    color: var(--k-color-primary);
    text-decoration: underline;
  }
}

.dep-status-mark {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 8px;
  color: var(--dep-accent-text);
  background: var(--dep-accent-soft);

  .market-icon {
    width: 0.92rem;
    height: 0.92rem;
  }
}

.dep-card-header {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.dep-title {
  flex: 1 1 auto;
  min-width: 0;

  h3 {
    margin: 0;
    color: var(--dep-text);
    font-size: 0.88rem;
    font-weight: 600;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.dep-title-line {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.dep-full-name {
  display: block;
  margin-top: 0.08rem;
  color: var(--dep-text-3);
  font-size: 0.69rem;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dep-header-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;

  .el-button {
    height: 1.6rem;
    padding: 0 0.42rem;
    border-color: transparent;
    background: transparent;
    color: var(--dep-text-2);
    font-size: 0.74rem;

    &:hover,
    &:focus-visible {
      border-color: transparent;
      background: var(--dep-hover);
      color: var(--dep-text);
    }
  }
}

.dep-summary-text {
  margin: 0.35rem 0 0;
  color: var(--dep-text-2);
  font-size: 0.74rem;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dep-badge {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.22rem;
  height: 1.15rem;
  padding: 0 0.38rem;
  border-radius: 5px;
  color: var(--dep-accent-text);
  background: var(--dep-accent-soft);
  font-size: 0.68rem;
  font-weight: 500;
  line-height: 1;

  .market-icon {
    width: 0.72rem;
    height: 0.72rem;
    flex: 0 0 auto;
  }
}

.dep-kind-pill {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.2rem;
  height: 1.15rem;
  padding: 0 0.38rem 0 0.24rem;
  border-radius: 5px;
  color: var(--dep-text-2);
  background: var(--dep-hover);
  font-size: 0.68rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;

  .dep-kind-icon {
    display: inline-grid;
    place-items: center;
    width: 0.8rem;
    height: 0.8rem;
    flex: 0 0 auto;
  }

  .market-icon {
    display: block;
    width: 0.68rem;
    height: 0.68rem;
  }
}

.dep-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.18rem 0.85rem;
  margin-top: 0.45rem;
}

.dep-meta-item {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  min-width: 0;
  font-size: 0.74rem;
  line-height: 1.5;

  span {
    flex: 0 0 auto;
    color: var(--dep-text-3);
  }

  strong {
    min-width: 0;
    color: var(--dep-text);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;

    &.danger {
      color: color-mix(in srgb, var(--k-color-danger) 68%, var(--dep-text));
    }

    &.warning {
      color: color-mix(in srgb, var(--k-color-warning) 72%, var(--dep-text));
    }
  }
}

.dep-status-text {
  margin: 0.4rem 0 0;
  color: var(--dep-text-2);
  font-size: 0.74rem;
  line-height: 1.5;
  overflow-wrap: anywhere;

  &.danger {
    color: color-mix(in srgb, var(--k-color-danger) 68%, var(--dep-text));
  }
}

.dep-card-actions {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.65rem;
  padding-top: 0.55rem;
  border-top: 1px solid var(--dep-line-soft);
  cursor: default;

  :deep(.version-trigger) {
    flex: 1 1 8rem;
    min-width: 0;
    max-width: 12rem;
  }

  &.floating {
    border-top-color: var(--dep-line);

    .el-select {
      max-width: none;
    }

    .dep-card-buttons {
      justify-content: flex-end;
    }
  }
}

.dep-card-buttons {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
}

.dep-more-anchor {
  display: inline-flex;
  flex: 0 0 auto;

  .k-icon {
    width: 1rem;
    height: 1rem;
  }
}

.dep-remove-button {
  border-color: color-mix(in srgb, var(--k-color-danger) 30%, var(--dep-line));
  color: color-mix(in srgb, var(--k-color-danger) 68%, var(--dep-text));
  background: transparent;

  &:hover,
  &:focus {
    border-color: color-mix(in srgb, var(--k-color-danger) 52%, var(--dep-line));
    color: color-mix(in srgb, var(--k-color-danger) 80%, var(--dep-text));
    background: color-mix(in srgb, var(--k-color-danger) 8%, transparent);
  }

  &:active {
    background: color-mix(in srgb, var(--k-color-danger) 14%, transparent);
  }
}

.dep-muted {
  min-width: 0;
  color: var(--dep-text-3);
  font-size: 0.75rem;
  line-height: 1.4;
}

// ---------------------------------------------------------------------------
// 列表行

.dep-list-row {
  @include dep-tokens;

  display: grid;
  grid-template-columns: var(--deps-list-columns, 1.8rem minmax(0, 1fr) 7rem 8rem 24rem);
  column-gap: 0.6rem;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.75rem;
  background: transparent;
  transition: background 120ms var(--dep-ease);

  & + .dep-list-row {
    border-top: 1px solid var(--dep-line);
  }

  &:hover {
    background: var(--dep-hover);
  }

  &.pending,
  &.manual {
    --dep-accent: var(--k-color-primary);
  }

  &.updatable {
    --dep-accent: var(--k-color-success);
  }

  &.error,
  &.invalid {
    --dep-accent: var(--k-color-danger);
  }

  &.unconfigured,
  &.local,
  &.workspace {
    --dep-accent: var(--k-color-warning);
  }

  &.bundle {
    --dep-accent: var(--k-color-primary);
  }

  &.ignored,
  &.check-disabled {
    --dep-accent: var(--fg1);
  }

  .dep-status-mark {
    justify-self: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 7px;

    .market-icon {
      width: 0.85rem;
      height: 0.85rem;
    }
  }

  .el-button {
    border-radius: 6px;
  }

  .el-button + .el-button {
    margin-left: 0;
  }

  .col-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.06rem;

    .name-display {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      color: var(--dep-text);
      font-size: 0.85rem;
      font-weight: 600;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      .name-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .name-full {
      color: var(--dep-text-3);
      font-size: 0.68rem;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dep-list-kind-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      height: 1.05rem;
      padding: 0 0.32rem;
      border-radius: 5px;
      color: var(--dep-text-2);
      background: var(--dep-hover);
      font-size: 0.66rem;
      font-weight: 500;
      line-height: 1;
      white-space: nowrap;

      .market-icon {
        width: 0.64rem;
        height: 0.64rem;
        flex: 0 0 auto;
      }
    }
  }

  .col-version,
  .col-latest {
    min-width: 0;
    padding: 0 0.25rem;
    color: var(--dep-text-2);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.has-update {
      color: var(--dep-accent-text);
      font-weight: 500;
    }

    &.pending-val {
      color: color-mix(in srgb, var(--k-color-primary) 62%, var(--dep-text));
      font-weight: 500;
    }
  }

  .col-actions {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.28rem;

    .el-button {
      height: 1.65rem;
      padding: 0 0.5rem;
      border-color: var(--dep-line-strong);
      background: transparent;
      color: var(--dep-text-2);
      font-size: 0.74rem;

      &:hover,
      &:focus-visible {
        border-color: var(--dep-line-strong);
        background: var(--dep-hover);
        color: var(--dep-text);
      }
    }

    .el-button--primary {
      border-color: transparent;
      background: var(--k-color-primary);
      color: var(--el-color-white);

      &:hover,
      &:focus-visible {
        border-color: transparent;
        background: var(--el-color-primary-dark-2);
        color: var(--el-color-white);
      }
    }
  }

  .dep-list-select {
    flex: 0 0 8rem;
    width: 8rem;
  }
}

// ---------------------------------------------------------------------------
// 响应式

@media (max-width: 768px) {
  .dep-list-row {
    grid-template-columns: 1.8rem minmax(0, 1fr) auto;
    grid-template-areas:
      'icon name name'
      'icon current latest'
      'actions actions actions';
    row-gap: 0.16rem;
    border: 1px solid var(--dep-line);
    border-radius: var(--deps-radius, 8px);
    background: var(--dep-surface);
    padding: 0.55rem 0.65rem;

    & + .dep-list-row {
      margin-top: 0.5rem;
      border-top: 1px solid var(--dep-line);
    }

    .dep-status-mark {
      grid-area: icon;
      align-self: start;
      margin-top: 0.06rem;
    }

    .col-name {
      grid-area: name;
    }

    .col-version {
      grid-area: current;
      padding: 0;

      &::before {
        content: attr(data-label) ' ';
        color: var(--dep-text-3);
        font-weight: 400;
      }
    }

    .col-latest {
      grid-area: latest;
      padding: 0;

      &::before {
        content: attr(data-label) ' ';
        color: var(--dep-text-3);
        font-weight: 400;
      }
    }

    .col-actions {
      grid-area: actions;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      max-width: none;
      margin-top: 0.4rem;
      padding-top: 0.4rem;
      border-top: 1px solid var(--dep-line-soft);

      .el-button {
        margin-left: 0;
      }
    }

    .dep-list-select {
      width: 8.5rem;
      flex: 0 0 8.5rem;
    }
  }

  .dep-card-actions .el-button,
  .dep-header-actions .el-button,
  .col-actions .el-button {
    height: 2rem;
    min-height: 2rem;
    padding: 0 0.6rem;
  }

  .dep-card-buttons {
    gap: 0.4rem;
  }
}

@media (max-width: 420px) {
  .dep-package-card .dep-status-mark {
    display: none;
  }

  .dep-card-actions {
    flex-direction: column;
    align-items: stretch;

    :deep(.version-trigger) {
      flex: 1 1 auto;
      max-width: none;
    }

    .dep-card-buttons {
      justify-content: flex-end;
    }
  }

  .dep-list-row {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'name'
      'current'
      'latest'
      'actions';

    .dep-status-mark {
      display: none;
    }

    .col-actions {
      max-width: none;
      margin-top: 0.35rem;
      flex-direction: row;
      flex-wrap: wrap;

      .el-button {
        flex: 0 0 auto;
      }
    }

    .dep-list-select {
      width: auto;
      flex: 1 1 8rem;
    }
  }
}
</style>


