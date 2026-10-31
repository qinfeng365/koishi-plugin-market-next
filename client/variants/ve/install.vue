<template>
  <el-dialog :model-value="!!active" @update:model-value="closePanel" class="ve-install-panel" destroy-on-close>
    <template v-if="active" #header="{ titleId, titleClass }">
      <span :id="titleId" :class="titleClass">
        {{ active + (localSelection ? ` (${t('dependencyCard.current.local')})` : '') }}
      </span>
      <el-select
        v-if="data"
        v-model="selectVersion"
        class="market-version-select"
        :disabled="localSelection"
        popper-class="market-version-popper"
      >
        <el-option v-for="({ result }, version) in data" :key="version" :value="version">
          {{ version }}
          <template v-if="version === current">{{ t('dependencyCard.actions.current') }}</template>
          <span :class="[result, 'theme-color', 'dot-hint']"></span>
        </el-option>
      </el-select>
    </template>

    <k-comment class="danger" v-if="danger" type="danger">{{ danger }}</k-comment>
    <k-comment class="warning" v-if="warning" type="warning">{{ warning }}</k-comment>

    <div v-if="!data && active && !localSelection">
      <k-comment :type="registryStatus?.error ? 'danger' : 'info'">{{ registryStatusText }}</k-comment>
    </div>

    <k-comment v-if="store.dependencies?.[active] && !current" type="danger">
      {{ t('operations.install.installErrorHint') }}
    </k-comment>

    <el-scrollbar v-if="data?.[version] && Object.keys(data[version].peers).length" class="peer-table-scroll">
      <table class="peer-table">
        <colgroup>
          <col class="peer-name-col">
          <col class="peer-range-col">
          <col class="peer-current-col">
          <col class="peer-status-col">
        </colgroup>
        <thead>
          <tr>
            <th>{{ t('operations.install.peerName') }}</th>
            <th>{{ t('operations.install.peerRange') }}</th>
            <th>{{ t('operations.install.peerCurrent') }}</th>
            <th>{{ t('operations.install.peerAvailability') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(peer, name) in data[version].peers" :key="name">
            <td class="text-left">{{ name }}</td>
            <td>{{ peer.request }}</td>
            <td>
              <span class="wrapper" v-if="shouldShowPeerVersionSelect(peer, name)">
                <span class="shadow">{{ getVersion(name) || t('operations.install.select') }}</span>
                <el-select
                  class="frameless market-version-select"
                  :model-value="getVersion(name)"
                  popper-class="market-version-popper"
                  @update:model-value="setVersion(name, $event)"
                >
                    <el-option value="">{{ t('dependencyCard.actions.remove') }}</el-option>
                  <el-option v-for="(_, version) in store.registry[name]" :key="version" :value="version">
                    {{ version }}
                    <template v-if="version === current">{{ t('dependencyCard.actions.current') }}</template>
                    <!-- <span :class="[result, 'theme-color', 'dot-hint']"></span> -->
                  </el-option>
                </el-select>
              </span>
              <span v-else class="peer-version" :class="{ workspace: !!getWorkspaceVersion(name), missing: !getPeerResolvedVersion(peer, name) }">
                {{ getPeerResolvedVersion(peer, name) || t('operations.confirm.notInstalled') }}
                <template v-if="getWorkspaceVersion(name)">{{ t('dependencyCard.current.workspace') }}</template>
              </span>
            </td>
            <td :class="['theme-color', peer.result]">
              <span class="inline-flex items-center gap-1">
                <k-icon :name="getResultIcon(peer.result)"></k-icon>
                {{ getResultText(peer, name) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </el-scrollbar>

    <template v-if="active && !global.static" #footer>
      <div class="left">
        <el-checkbox v-model="bulkMode">
          {{ t('operations.install.bulkMode') }}
          <k-hint>
            {{ t('operations.install.bulkModeHint') }}
          </k-hint>
        </el-checkbox>
      </div>
      <div class="right">
        <el-button v-if="local" type="primary" @click="configure()">{{ t('dependencyCard.actions.configure') }}</el-button>
        <template v-if="localSelection">
          <el-button v-if="showRemoveButton" @click="installDep('', true)" type="danger">{{ t('operations.install.remove') }}</el-button>
          <el-button v-else-if="workspace" @click="installDep(workspace)" type="success">{{ t('operations.install.add') }}</el-button>
        </template>
        <template v-else-if="data">
          <el-button v-if="showRemoveButton" @click="requestRemove()" type="danger">{{ t('operations.install.uninstall') }}</el-button>
          <el-button :type="result" @click="installDep(version)" :disabled="unchanged">
            {{ current ? t('operations.install.update') : store.dependencies?.[active] ? t('operations.install.repair') : t('operations.install.install') }}
          </el-button>
        </template>
      </div>
    </template>
  </el-dialog>

  <el-dialog v-model="showRemoveDialog" class="ve-market-remove-dialog" destroy-on-close>
    {{ t('operations.install.removeConfigQuestion') }}
    <template #footer>
      <div class="left">
        <el-checkbox v-model="saveChoice">
          {{ t('operations.install.rememberChoice') }}
          <k-hint>
            {{ t('operations.install.rememberChoiceHint') }}
          </k-hint>
        </el-checkbox>
      </div>
      <div class="right">
        <el-button type="danger" @click="installDep('', false, true)">{{ t('operations.install.delete') }}</el-button>
        <el-button type="primary" @click="installDep('', false, false)">{{ t('operations.install.keep') }}</el-button>
      </div>
    </template>
  </el-dialog>

  <bundle-uninstall
    v-model="showBundleUninstallDialog"
    :package-name="bundleUninstallTarget"
    :record="bundleUninstallRecord"
  ></bundle-uninstall>
</template>

<script lang="ts" setup>
import BundleUninstall from '../../components/bundle-uninstall.vue'
import { useInstall } from '../../composables/use-install'

const { t, global, store, active, saveChoice, showRemoveDialog, showBundleUninstallDialog, bundleUninstallTarget, bulkMode, installDep, selectVersion, current, danger, warning, data, registryStatus, registryStatusText, version, shouldShowPeerVersionSelect, getVersion, setVersion, getWorkspaceVersion, getPeerResolvedVersion, getResultIcon, getResultText, local, configure, localSelection, showRemoveButton, workspace, requestRemove, unchanged, result, bundleUninstallRecord, closePanel } = useInstall()
</script>

<style lang="scss">

.ve-install-panel .theme-color {
  @mixin apply-color($name) {
    &.#{$name} {
      color: var(--#{$name});
    }
  }

  @include apply-color(primary);
  @include apply-color(success);
  @include apply-color(warning);
  @include apply-color(danger);
}

.ve-install-panel.el-dialog,
.el-dialog.ve-install-panel,
.ve-install-panel .el-dialog {
  width: min(720px, calc(100vw - 32px)) !important;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--k-color-border) 88%, var(--fg1) 12%);
  border-radius: 10px;
  color: var(--fg1);
  background: var(--k-card-bg);
  box-shadow: none;
}

.ve-install-panel {
  .el-dialog__header {
    display: flex;
    gap: 0 0.5em;
    align-items: center;
    min-height: 62px;
    padding: 14px 44px 12px 20px;
    border-bottom: 1px solid color-mix(in srgb, var(--k-color-border) 82%, transparent);
    background: color-mix(in srgb, var(--k-side-bg) 72%, var(--k-card-bg));

    .el-dialog__title {
      min-width: 0;
      overflow: hidden;
      color: var(--fg1);
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 700;
      margin-right: 0.5rem;
      flex: 0 0 auto;
    }

    .el-select {
      flex: 1 1 auto;
      max-width: 12.5rem;
      margin: -2px 0 -4px;
    }
  }

  .el-dialog__headerbtn {
    top: 11px;
    right: 12px;
    width: 38px;
    height: 38px;
    border-radius: 8px;
    color: var(--fg2);
    transition: background 0.15s, color 0.15s;

    &:hover {
      color: var(--k-color-primary);
      background: color-mix(in srgb, var(--k-color-primary) 12%, transparent);
    }
  }

  .warning {
    color: var(--k-color-warning);
  }

  .danger {
    color: var(--k-color-danger);
  }

  .version-badges {
    float: right;
    margin-right: -12px;
  }

  .el-dialog__body {
    padding: 16px 20px 6px;
    min-height: 40px;
    background: color-mix(in srgb, var(--k-side-bg) 58%, var(--k-card-bg));

    > div {
      margin: 1rem 0;
    }

    &:last-child {
      padding-bottom: 1rem;
    }
  }

  .peer-table-scroll {
    border-radius: 8px;
    background: var(--k-card-bg);
    box-shadow: none;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    overflow: hidden;
    margin: 0.75rem 0;

    .peer-name-col {
      width: 42%;
    }

    .peer-range-col {
      width: 18%;
    }

    .peer-current-col {
      width: 20%;
    }

    .peer-status-col {
      width: 20%;
    }

    thead, tbody {
      td, th {
        padding: 0.62rem 0.875rem;
        white-space: nowrap;
        overflow: hidden;
        color: var(--fg1);
        text-overflow: ellipsis;
        border-bottom: 1px solid var(--k-color-border);
        border-right: 1px solid var(--k-color-border);
        font-size: 0.82rem;

        &:last-child {
          border-right: none;
        }
      }
    }

    th {
      background: color-mix(in srgb, var(--fg1) 5%, var(--k-side-bg));
      color: var(--fg2);
      font-weight: 700;
      text-align: left;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tbody tr {
      background: var(--k-card-bg);
      transition: background 0.15s;

      &:hover {
        background: color-mix(in srgb, var(--k-color-primary) 6%, var(--k-card-bg));
      }
    }
  }

  .peer-version {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    min-height: 28px;
    overflow: hidden;
    padding: 0 9px;
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    color: var(--fg1);
    background: color-mix(in srgb, var(--k-side-bg) 42%, var(--k-card-bg));
    font-weight: 700;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.workspace {
      gap: 6px;
      color: var(--k-color-success);
      border-color: color-mix(in srgb, var(--k-color-success) 34%, var(--k-color-border));
      background: color-mix(in srgb, var(--k-color-success) 10%, var(--k-card-bg));
    }

    &.missing {
      color: var(--k-color-danger);
      border-color: color-mix(in srgb, var(--k-color-danger) 34%, var(--k-color-border));
      background: color-mix(in srgb, var(--k-color-danger) 10%, var(--k-card-bg));
    }
  }

  span.link {
    &:hover {
      cursor: pointer;
      text-decoration: underline;
    }
  }

  .el-button + .el-button {
    margin-left: 1rem;
  }

  .el-dialog__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 68px;
    padding: 14px 16px;
    border-top: 1px solid color-mix(in srgb, var(--k-color-border) 82%, transparent);
    background: color-mix(in srgb, var(--k-side-bg) 50%, var(--k-card-bg));
  }

    .wrapper {
    position: relative;
    display: inline-flex;
    min-width: 7.8rem;
    max-width: 100%;

    .shadow {
      letter-spacing: 1px;
      visibility: hidden;
      padding-right: 22px; // .el-input__suffix
    }

    .el-select {
      position: absolute;
      left: 0;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
    }
  }

  .frameless {
    --el-fill-color-blank: var(--k-card-bg);
    --el-border-color: var(--k-color-border);
    --el-text-color-regular: var(--fg1);

    :deep(.el-input__wrapper) {
      min-height: 30px;
      border-radius: 8px;
      box-shadow: 0 0 0 1px var(--k-color-border) inset;
    }
  }
}

.ve-install-panel .dot-hint::before {
  content: '';
  position: absolute;
  border-radius: 100%;
  width: 0.5rem;
  height: 0.5rem;
  top: 50%;
  right: 20px;
  transform: translate(0, -50%);
  background-color: currentColor;
  transition: background-color 0.3s ease;
  box-shadow: 1px 1px 2px #3333;
}

</style>
