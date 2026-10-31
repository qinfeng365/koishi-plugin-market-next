<template>
  <market-dialog :model-value="!!active" @update:model-value="closePanel" class="install-panel" width="720px" destroy-on-close>
    <template v-if="active" #header="{ titleId, titleClass }">
      <span :id="titleId" :class="titleClass">
        {{ active + (localSelection ? ` (${t('dependencyCard.current.local')})` : '') }}
      </span>
      <version-picker
        v-if="data"
        v-model="selectVersion"
        :versions="data"
        :current="current"
        :latest="Object.keys(data).find(item => !item.includes('-'))"
        :disabled="localSelection"
      ></version-picker>
    </template>

    <k-comment class="danger" v-if="danger" type="danger"><p>{{ danger }}</p></k-comment>
    <k-comment class="warning" v-if="warning" type="warning"><p>{{ warning }}</p></k-comment>

    <div v-if="!data && active && !localSelection">
      <!-- The dependency card keeps showing an earlier error while it is fetched again; this dialog shows the fetch it waits for. -->
      <k-comment :type="registryStatus?.error && !registryStatus.loading ? 'danger' : 'primary'"><p>{{ registryStatusText }}</p></k-comment>
    </div>

    <k-comment v-if="store.dependencies?.[active] && !current" type="danger">
      <p>{{ t('operations.install.installErrorHint') }}</p>
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
            <td :data-label="t('operations.install.peerRange')">{{ peer.request }}</td>
            <td>
              <version-picker
                v-if="shouldShowPeerVersionSelect(peer, name)"
                :model-value="getVersion(name)"
                :versions="store.registry[name]"
                :current="store.dependencies?.[name]?.resolved"
                :latest="Object.keys(store.registry[name]).find(item => !item.includes('-'))"
                :placeholder="t('operations.install.select')"
                removable
                @update:model-value="setVersion(name, $event)"
              ></version-picker>
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
          <!-- The color shows compatibility; a disabled button has nothing to report, so it stays neutral. -->
          <el-button :type="unchanged ? undefined : result" @click="installDep(version)" :disabled="unchanged">
            {{ current ? t('operations.install.update') : store.dependencies?.[active] ? t('operations.install.repair') : t('operations.install.install') }}
          </el-button>
        </template>
      </div>
    </template>
  </market-dialog>

  <market-dialog v-model="showRemoveDialog" class="market-remove-dialog" width="480px" destroy-on-close>
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
  </market-dialog>

  <bundle-uninstall
    v-model="showBundleUninstallDialog"
    :package-name="bundleUninstallTarget"
    :record="bundleUninstallRecord"
  ></bundle-uninstall>
</template>

<script lang="ts" setup>
import BundleUninstall from './bundle-uninstall.vue'
import VersionPicker from './version-picker.vue'
import MarketDialog from './market-dialog.vue'
import { useInstall } from '../composables/use-install'

const { t, global, store, active, saveChoice, showRemoveDialog, showBundleUninstallDialog, bundleUninstallTarget, bulkMode, installDep, selectVersion, current, danger, warning, data, registryStatus, registryStatusText, version, shouldShowPeerVersionSelect, getVersion, setVersion, getWorkspaceVersion, getPeerResolvedVersion, getResultIcon, getResultText, local, configure, localSelection, showRemoveButton, workspace, requestRemove, unchanged, result, bundleUninstallRecord, closePanel } = useInstall()
</script>

<style lang="scss">

.theme-color {
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

.install-panel {
  .el-dialog__header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    padding-right: 36px;

    .el-dialog__title {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }

  .warning {
    color: var(--k-color-warning);
  }

  .danger {
    color: var(--k-color-danger);
  }

  .market-dialog-body > div {
    margin: 1rem 0;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid var(--k-color-border);
    border-radius: 8px;

    td, th {
      padding: 0.5rem 0.875rem;
      border-top: 1px solid var(--k-color-divider);
      text-align: left;
      white-space: nowrap;
    }

    // Long peer names wrap so the table never pushes the dialog sideways.
    td:first-child {
      white-space: normal;
      overflow-wrap: anywhere;
    }

    // The version picker is wider than plain versions, so this column is centered to line it up with its header.
    td:nth-child(3),
    th:nth-child(3) {
      text-align: center;
    }

    thead th {
      border-top: 0;
      color: var(--fg3);
      font-size: 0.8125rem;
      font-weight: normal;
    }
  }

  .peer-version {
    font-weight: 600;

    &.workspace {
      color: var(--k-color-success);
    }

    &.missing {
      color: var(--k-color-danger);
    }
  }

  .el-dialog__footer .left {
    margin-right: auto;
  }

  .el-dialog__footer .right {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;

    .el-button + .el-button {
      margin-left: 0;
    }
  }
}

.market-remove-dialog .el-dialog__footer {
  .left {
    margin-right: auto;
  }

  .right {
    display: flex;
    gap: 0.5rem;
  }

  .el-button + .el-button {
    margin-left: 0;
  }
}

@media (max-width: 768px) {
  // Each peer becomes a two-line block: name and availability, then range and current version.
  .install-panel .peer-table {
    display: block;

    colgroup,
    thead {
      display: none;
    }

    tbody {
      display: block;
    }

    tr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.25rem 0.75rem;
      align-items: center;
      padding: 0.625rem 0.875rem;
      // Koishi's global table rules put borders on tr, which only show once it stops being a table row.
      border: 0;

      & + tr {
        border-top: 1px solid var(--k-color-divider);
      }
    }

    td {
      padding: 0;
      border-top: 0;
    }

    // The name leads the block, so it is a step larger than the status beside it.
    td:nth-child(1) {
      font-size: 0.9375rem;
      font-weight: 500;
    }

    td:nth-child(2) {
      color: var(--fg2);
      font-size: 0.875rem;

      &::before {
        content: attr(data-label) ' ';
        color: var(--fg3);
      }
    }

    td:nth-child(3) {
      grid-area: 2 / 2;
      justify-self: end;
    }

    td:nth-child(4) {
      grid-area: 1 / 2;
      justify-self: end;
    }
  }
}

</style>
