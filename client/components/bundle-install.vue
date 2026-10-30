<template>
  <market-dialog
    :model-value="!!activeBundle"
    append-to-body
    class="bundle-install-panel"
    width="800px"
    destroy-on-close
    @update:model-value="close"
  >
    <template #header="{ titleId, titleClass }">
      <div class="bundle-title">
        <span :id="titleId" :class="titleClass">{{ title }}</span>
        <span class="dialog-tag primary">{{ t('bundle.label') }}</span>
      </div>
      <div v-if="activeBundle" class="bundle-meta">{{ activeBundle.package.name }} · {{ bundleVersion }}</div>
    </template>

    <template v-if="activeBundle">
      <div v-if="loading" class="bundle-state">{{ t('bundle.loading') }}</div>
      <k-comment v-else-if="error" type="danger">
        <p>{{ error }}</p>
      </k-comment>

      <template v-else-if="bundle">
        <p v-if="bundle.description" class="dialog-intro">{{ bundle.description }}</p>

        <k-comment v-if="validationErrors.length" type="danger">
          <p>{{ t('bundle.messages.invalidManifest') }}</p>
          <p v-for="item in validationErrors" :key="item">{{ item }}</p>
        </k-comment>
        <k-comment v-if="validationWarnings.length" type="warning">
          <p>{{ t('bundle.messages.manifestWarnings') }}</p>
          <p v-for="item in validationWarnings" :key="item">{{ item }}</p>
        </k-comment>

        <section v-for="section in sections" :key="section.key" class="dialog-section">
          <div class="dialog-section-title">
            <span>{{ section.label }}</span>
            <span class="dialog-count">{{ section.members.length }}</span>
          </div>
          <div class="dialog-list" :style="{ '--bundle-columns': section.columns.length }">
            <bundle-all-row :columns="section.columns"></bundle-all-row>
            <div
              v-for="member in section.members"
              :key="getMemberKey(member)"
              class="dialog-list-row bundle-member"
            >
              <!-- Clicking an optional member's info also toggles whether it is installed, except for members
                   whose installed version would be replaced: those only change through their checkbox. -->
              <div
                :class="['member-main', { toggle: !member.required && !versionMismatch(member) }]"
                @click="!member.required && !versionMismatch(member) && (member.selected = !member.selected)"
              >
                <div class="member-line">
                  <span class="member-name">{{ formatShortname(member.package) }}</span>
                  <span class="member-version">{{ member.version }}</span>
                  <span v-for="tag in riskTags(member)" :key="tag.label" :class="['dialog-tag', tag.type]">{{ tag.label }}</span>
                </div>
                <div class="member-sub">{{ member.package }} · {{ getInstalledText(member.package) }}</div>
                <p v-if="getPackageDescription(member.package)" class="member-desc">
                  {{ getPackageDescription(member.package) }}
                </p>
              </div>
              <!-- Core members are always installed, so only optional ones have this column. -->
              <el-checkbox v-if="!member.required" v-model="member.selected" :aria-label="`${t('bundle.members.install')}: ${member.package}`"></el-checkbox>
              <!-- Options only show as checked when a config gets created (see createsConfig). The raw usePreset
                   value is kept so that re-checking "create config" restores it. "Use preset" goes by whether the
                   manifest ships one, like the editor, so it can still be turned off after editing the preset to {}. -->
              <el-checkbox
                :model-value="createsConfig(member)"
                :disabled="!member.selected || member.move || member.conflict === 'same-group'"
                :aria-label="`${t('bundle.members.createConfig')}: ${member.package}`"
                @update:model-value="member.createConfig = !!$event"
              ></el-checkbox>
              <el-checkbox
                v-if="section.presets"
                :model-value="createsConfig(member) && member.usePreset"
                :disabled="!createsConfig(member) || !shipsPreset(member)"
                :aria-label="`${t('bundle.members.usePreset')}: ${member.package}`"
                @update:model-value="member.usePreset = !!$event"
              ></el-checkbox>

              <!-- The version note also shows for unselected members: it is why they start unselected. -->
              <div v-if="versionMismatch(member) || member.selected && member.conflict || editsPreset(member)" class="member-details">
                <p v-if="versionMismatch(member)" class="member-note danger">
                  {{ t('bundle.conflict.version', { current: store.dependencies?.[member.package]?.resolved, range: member.version }) }}
                </p>
                <template v-if="member.selected && member.conflict === 'other-config'">
                  <p class="member-note warning">{{ t('bundle.conflict.config') }}</p>
                  <el-checkbox v-model="member.move">{{ t('bundle.members.moveConfig') }}</el-checkbox>
                </template>
                <p v-if="member.selected && member.conflict === 'same-group'" class="member-note">{{ t('bundle.conflict.sameGroup') }}</p>

                <!-- Hidden while the JSON below has an error, since fixing it would overwrite these fields.
                     Text values can be filled in; anything else (lists, numbers) is shown as is. -->
                <div v-if="usesPreset(member) && !draftOf(member)?.error && sensitiveFields(member).length" class="sensitive-fields">
                  <div class="editor-title">{{ t('bundle.editor.sensitive') }}</div>
                  <label v-for="field in sensitiveFields(member)" :key="JSON.stringify(field.path)" class="editor-field">
                    <span>{{ field.path.join('.') }}</span>
                    <el-input
                      v-if="typeof field.value === 'string' || field.value == null"
                      :model-value="field.value"
                      size="small"
                      :placeholder="t('bundle.editor.placeholder', { field: field.path.join('.') })"
                      :show-password="isSecretConfigPath(field.path)"
                      @update:model-value="writeField(member, field.path, $event)"
                    ></el-input>
                    <code v-else class="sensitive-value">{{ isSecretConfigPath(field.path) ? '••••••' : JSON.stringify(field.value) }}</code>
                  </label>
                </div>

                <details v-if="editsPreset(member)" class="member-config">
                  <summary>{{ t('bundle.editor.viewPreset') }}</summary>
                  <textarea
                    class="raw-json-editor"
                    :value="draftOf(member)?.text ?? formatConfig(member.config)"
                    rows="8"
                    @input="onJsonInput(member, $event.target.value)"
                  ></textarea>
                </details>
                <!-- Outside the editor, so it stays visible (it blocks installing) even when that is collapsed. -->
                <p v-if="editsPreset(member) && draftOf(member)?.error" class="member-note danger">
                  {{ draftOf(member)!.error!.notObject ? t('bundle.editor.notObject') : t('bundle.editor.jsonError', { error: draftOf(member)!.error!.message }) }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <bundle-diff :rows="diffRows"></bundle-diff>
      </template>
    </template>

    <template #footer>
      <el-button @click="close">{{ t('bundle.actions.cancel') }}</el-button>
      <el-button type="primary" :loading="installing" :disabled="!canInstall" @click="confirmInstall">
        {{ t('bundle.actions.install') }}<template v-if="selectedMembers.length"> ({{ selectedMembers.length }})</template>
      </el-button>
    </template>
  </market-dialog>
</template>

<script setup lang="ts">

import { computed, reactive, ref, watch } from 'vue'
import { Dict, message, send, socket, store, useContext } from '@koishijs/client'
import type { Registry } from '@koishijs/registry'
import {
  BundleInstallMember,
  BundleInstallResult,
  PluginBundleManifest,
  parseBundleManifest,
  isSecretConfigPath,
  scanSensitiveConfig,
  validateBundleManifest,
  getBundleGroupIdent,
} from '../../src/shared/bundle'
import {
  activeBundle,
  formatShortname,
  getBundleMemberConfigState,
  installProgressState,
  prepareInstallFallbackRetry,
  resetInstallFallbackState,
  toastText,
  type InstallOptions,
} from './utils'
import { satisfies } from 'semver'
import { useMarketNextI18n } from '../i18n'
import { getMarketObject, loadMarketObjects } from '../market/state'
import BundleAllRow, { type BundleColumn } from './bundle-all-row.vue'
import BundleDiff from './bundle-diff.vue'
import MarketDialog from './market-dialog.vue'

const loading = ref(false)
const installing = ref(false)
const error = ref('')
const registry = ref<Registry>()
const bundle = ref<PluginBundleManifest>()
const resolvedBundleVersion = ref('')
const members = reactive<BundleInstallMember[]>([])
const ctx = useContext()
const { t, locale } = useMarketNextI18n()


const title = computed(() => activeBundle.value?.shortname || activeBundle.value?.package.name || t('bundle.label'))
const bundleVersion = computed(() => resolvedBundleVersion.value || activeBundle.value?.package.version || '')
const validation = computed(() => {
  if (!activeBundle.value || !bundle.value) return { valid: false, errors: [], warnings: [] }
  return validateBundleManifest(activeBundle.value.package.name, bundle.value, { checkKeyword: false })
})
const validationErrors = computed(() => validation.value.errors)
const validationWarnings = computed(() => validation.value.warnings)
const selectedMembers = computed(() => members.filter(member => member.selected))
// Names only: each member row already shows its full package name and version range, and a version
// mismatch gets its own note, so repeating `package@range` here would turn the summary back into a
// wall of text.
const diffRows = computed(() => {
  if (!activeBundle.value) return []
  const selected = selectedMembers.value
  return [
    { label: t('bundle.diff.install'), items: [activeBundle.value.package.name, ...selected.map(m => m.package)].map(name => ({ name: formatShortname(name) })) },
    { label: t('bundle.diff.config'), items: selected.filter(createsConfig).map(m => ({ name: m.plugin, preset: usesPreset(m) })) },
    { label: t('bundle.diff.move'), items: selected.filter(m => m.move).map(m => ({ name: m.plugin })) },
    { label: t('bundle.diff.skip'), items: selected.filter(m => !createsConfig(m) && !m.move).map(m => ({ name: m.plugin })) },
  ]
})

// What the user typed into each preset editor, with its error if it doesn't parse (kept untranslated,
// so it follows a language switch). The textarea would
// otherwise snap back to the last valid preset on every re-render. The sensitive-field inputs are
// hidden while the draft has an error, and typing in them drops the draft (see writeField).
const presetDrafts = reactive<Record<string, { text: string, error?: { notObject?: boolean, message?: string } }>>({})

function getMemberKey(member: BundleInstallMember) {
  return `${member.package}:${member.plugin}`
}

function draftOf(member: BundleInstallMember) {
  return presetDrafts[getMemberKey(member)]
}

// Typing in a sensitive field also drops the preset draft, so the textarea shows the new value.
function writeField(member: BundleInstallMember, field: string[], value: string) {
  field.slice(0, -1).reduce<Dict>((value, key) => value[key], member.config!)[field.at(-1)!] = value
  delete presetDrafts[getMemberKey(member)]
}

// A preset has to stay a JSON object, so the editor and the config it writes keep working.
function onJsonInput(member: BundleInstallMember, text: string) {
  let parsed: unknown
  let error: { notObject?: boolean, message?: string } | undefined
  try {
    parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) error = { notObject: true }
  } catch (err) {
    error = { message: (err as Error).message }
  }
  if (!error) member.config = parsed as BundleInstallMember['config']
  presetDrafts[getMemberKey(member)] = { text, error }
}

const canInstall = computed(() => {
  return !!activeBundle.value 
    && !!bundle.value 
    && validation.value.valid 
    && selectedMembers.value.length > 0 
    && !loading.value
    // Only presets that will be used count, so an error in an unused one doesn't block installing.
    // A broken preset blocks installing whenever the user means to use it, even one edited down to {}.
    && !members.some(m => editsPreset(m) && draftOf(m)?.error)
})

// The serial drops a response for a bundle the user has already left, so it can't mix into the next one.
let loadSerial = 0

watch(activeBundle, async (value) => {
  const serial = ++loadSerial
  error.value = ''
  registry.value = undefined
  bundle.value = undefined
  resolvedBundleVersion.value = ''
  members.splice(0)
  Object.keys(presetDrafts).forEach(key => delete presetDrafts[key])
  if (!value) return
  loading.value = true
  try {
    const data = await send('market/package', value.package.name) as Registry
    if (serial !== loadSerial) return
    if (!data?.versions) {
      error.value = t('bundle.messages.noMetadata')
      return
    }
    registry.value = data
    const remoteEntry = data.versions?.[value.package.version]
      ? [value.package.version, data.versions[value.package.version]] as const
      : Object.entries(data.versions ?? {})[0]
    if (!remoteEntry) {
      error.value = t('bundle.messages.noMetadata')
      return
    }
    const [remoteVersion, remote] = remoteEntry
    const parsed = parseBundleManifest(remote?.koishi?.bundle)
    if (!parsed) {
      error.value = t('bundle.messages.noManifest')
      return
    }
    resolvedBundleVersion.value = remoteVersion
    bundle.value = parsed
    void loadMarketObjects(parsed.members.map(member => member.package)).catch(error => {
      console.error('[market-next] failed to load bundle member metadata', error)
    })
    const groupKey = `group:${getBundleGroupIdent(value.package.name)}`
    for (const member of parsed.members) {
      const state = getBundleMemberConfigState(ctx, member, groupKey)
      const hasConfig = !!(state.group.length || state.external.length)
      const conflictType = state.group.length ? 'same-group' : state.external.length ? 'other-config' : undefined
      
      const dep = store.dependencies?.[member.package]
      members.push({
        ...member,
        // A copy, so filling in the preset doesn't change the manifest it came from.
        config: member.config && JSON.parse(JSON.stringify(member.config)),
        selected: !!member.required || (!!dep && !versionMismatch(member)),
        createConfig: !hasConfig,
        usePreset: !hasConfig && hasPreset(member),
        move: false,
        conflict: conflictType,
      })
    }
    const names = parsed.members.map(member => member.package).filter(name => !store.registry?.[name])
    if (names.length) {
      const result = await (send('market/registry', names) ?? Promise.resolve(undefined)).catch(() => undefined)
      if (result && serial === loadSerial) store.registry = { ...store.registry, ...result }
    }
  } catch (err) {
    console.error(err)
    if (serial === loadSerial) error.value = err instanceof Error ? err.message : t('bundle.messages.loadFailed')
  } finally {
    if (serial === loadSerial) loading.value = false
  }
}, { immediate: true })

function memberInfo(name: string) {
  return getMarketObject(name)
}

function getPackageDescription(name: string) {
  const data = memberInfo(name)
  const description = data?.manifest?.description || data?.package?.description
  if (typeof description === 'string') return description
  if (description && typeof description === 'object') {
    const preferred = locale.value.toLowerCase().startsWith('zh')
      ? ['zh-CN', 'zh', 'en-US', 'en']
      : ['en-US', 'en', 'zh-CN', 'zh']
    for (const key of preferred) {
      const text = description[key]
      if (text) return text
    }
    return Object.values(description).find(Boolean)
  }
}

function getInstalledText(name: string) {
  const dep = store.dependencies?.[name]
  if (dep?.resolved) return t('bundle.members.installed', { version: dep.resolved })
  if (store.packages?.[name]) return t('bundle.members.loaded', { version: store.packages[name].package.version })
  return t('bundle.members.notInstalled')
}

function versionMeta(member: BundleInstallMember) {
  return store.registry?.[member.package]?.[member.version]
}

function riskTags(member: BundleInstallMember) {
  const data = memberInfo(member.package)
  const tags: Array<{ label: string, type: string }> = []
  if (!data) tags.push({ label: t('bundle.members.marketMissing'), type: 'warning' })
  if (data?.verified) tags.push({ label: t('bundle.members.verified'), type: 'success' })
  if (data?.insecure) tags.push({ label: t('bundle.members.insecure'), type: 'danger' })
  if (data?.deprecated || versionMeta(member)?.deprecated) tags.push({ label: t('bundle.members.deprecated'), type: 'danger' })
  if (data?.manifest?.preview) tags.push({ label: t('bundle.members.preview'), type: 'warning' })
  if (data?.portable) tags.push({ label: t('bundle.members.portable'), type: 'info' })
  if (shipsPreset(member)) tags.push({ label: t('bundle.members.hasPreset'), type: 'warning' })
  return tags
}

// Separate from `conflict`, which only describes config conflicts, so a member can have both.
function versionMismatch(member: BundleInstallMember) {
  const resolved = store.dependencies?.[member.package]?.resolved
  return !!resolved && !satisfies(resolved, member.version, { includePrerelease: true })
}

// Whether the bundle will create a new config for this member, and whether that config takes the preset.
// The summary and the request go by these. The "use preset" checkbox and the editor go by whether the
// manifest ships a preset instead (editsPreset), so both stay usable after editing it down to {};
// an empty preset writes the same {} as no preset, so the two never disagree on what gets installed.
function createsConfig(member: BundleInstallMember) {
  return member.selected && member.createConfig && !member.move
}

function usesPreset(member: BundleInstallMember) {
  return createsConfig(member) && member.usePreset && hasPreset(member)
}

// Only members whose manifest ships a preset get the editor, so editing one down to {} keeps it.
function shipsPreset(member: BundleInstallMember) {
  return !!bundle.value?.members.some(m => m.package === member.package && m.plugin === member.plugin && hasPreset(m))
}

function editsPreset(member: BundleInstallMember) {
  return member.usePreset && createsConfig(member) && shipsPreset(member)
}

function hasPreset(member: { config?: Record<string, any> }) {
  return !!member.config && Object.keys(member.config).length > 0
}

function sensitiveFields(member: BundleInstallMember) {
  return scanSensitiveConfig(member.config).map(path => ({
    path,
    value: path.reduce<any>((value, key) => value?.[key], member.config),
  }))
}

function formatConfig(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2)
}

function close() {
  if (installing.value) return
  activeBundle.value = undefined
}

// Core and optional members get their own tables, each with an "all members" row (see bundle-all-row).
// A bulk check leaves out members where it could do harm: "install" skips members whose installed
// version would be replaced, and "create config" skips members already configured outside the bundle,
// which would get a duplicate. Their own rows still offer both, with a note explaining why. Bundles
// have a handful of members, so rebuilding this on every click is cheap.
const sections = computed(() => [
  { key: 'required', label: t('bundle.members.required'), members: members.filter(m => m.required) },
  { key: 'optional', label: t('bundle.members.optional'), members: members.filter(m => !m.required) },
].filter(section => section.members.length).map((section) => {
  const configurable = section.members.filter(m => m.selected && !m.move && m.conflict !== 'same-group')
  // The preset column only appears when a member of this table ships a preset.
  const presets = section.members.some(shipsPreset)
  // In the same order as the checkboxes in each row: install (optional members only), create config, use preset.
  const columns: BundleColumn<BundleInstallMember>[] = []
  if (section.key === 'optional') {
    columns.push({
      label: t('bundle.members.install'),
      members: section.members,
      targets: section.members.filter(m => !versionMismatch(m)),
      get: (m: BundleInstallMember) => m.selected,
      set: (m: BundleInstallMember, value: boolean) => m.selected = value,
    })
  }
  columns.push({
    label: t('bundle.members.createConfig'),
    members: configurable,
    targets: configurable.filter(m => !m.conflict),
    get: (m: BundleInstallMember) => m.createConfig,
    set: (m: BundleInstallMember, value: boolean) => m.createConfig = value,
  })
  if (presets) {
    columns.push({
      label: t('bundle.members.usePreset'),
      members: section.members.filter(m => createsConfig(m) && shipsPreset(m)),
      get: (m: BundleInstallMember) => m.usePreset,
      set: (m: BundleInstallMember, value: boolean) => m.usePreset = value,
    })
  }
  return { ...section, presets, columns }
}))

async function confirmInstall() {
  if (!activeBundle.value || !bundle.value || installing.value) return
  installing.value = true

  installProgressState.title = t('bundle.messages.installing')
  installProgressState.logs = []
  installProgressState.status = 'running'
  installProgressState.visible = true
  installProgressState.selfUpdate = false
  installProgressState.environmentRestore = false
  resetInstallFallbackState()
  installProgressState.logs.push({
    type: 'stdout',
    line: t('bundle.messages.submitted'),
  })

  const request = {
    package: activeBundle.value!.package.name,
    version: bundleVersion.value,
    bundle: bundle.value!,
    members: members.map(member => ({
      ...member,
      createConfig: createsConfig(member) || !!member.move,
      // A moved config keeps its own values, so it never takes the preset.
      usePreset: usesPreset(member),
    })),
  }

  const runInstall = async (options?: InstallOptions) => {
    installing.value = true
    let disconnectedBeforeResponse = false
    let resolveDisconnected: (value: undefined) => void
    const disconnected = new Promise<undefined>((resolve) => {
      resolveDisconnected = resolve
    })
    const dispose = watch(socket, (value, previous) => {
      if (value || !previous) return
      disconnectedBeforeResponse = true
      resolveDisconnected(undefined)
      dispose()
    })
    const waitTimer = setTimeout(() => {
      if (installProgressState.status !== 'running') return
      installProgressState.logs.push({
        type: 'stdout',
        line: t('bundle.messages.waiting'),
      })
    }, 8000)
    try {
      const task = send('market/install-bundle', request, undefined, options ?? {}) as Promise<BundleInstallResult> | undefined
      const result = await Promise.race([task ?? Promise.resolve(undefined), disconnected])
      if (disconnectedBeforeResponse) {
        installProgressState.status = 'error'
        reportInstallError(t('bundle.messages.disconnected'))
        return undefined
      }
      if (!result) {
        installProgressState.status = 'error'
        reportInstallError(t('bundle.messages.disconnected'))
        return undefined
      }
      if (result?.code) {
        installProgressState.status = 'error'
        reportInstallError(t('bundle.messages.exitCode', { code: result.code }))
        await prepareInstallFallbackRetry(runInstall, options?.installEndpoint)
        return result.code
      }
      installProgressState.status = 'success'
      const moved = result?.moved?.length ? t('bundle.messages.moved', { count: result.moved.length }) : ''
      const skipped = result?.skipped?.length ? t('bundle.messages.skipped', { count: result.skipped.length }) : ''
      message.success(t('bundle.messages.completed', { moved, skipped }))
      activeBundle.value = undefined
      return 0
    } finally {
      clearTimeout(waitTimer)
      dispose()
      installing.value = false
    }
  }

  try {
    await runInstall()
  } catch (err) {
    console.error(err)
    installProgressState.status = 'error'
    reportInstallError(formatInstallError(err))
  }
}

function reportInstallError(detail: string) {
  const text = detail || t('bundle.messages.unknownError')
  installProgressState.logs.push({
    type: 'stderr',
    line: t('bundle.messages.installFailed', { detail: text }),
  })
  message.error(t('bundle.messages.installFailed', { detail: toastText(text) }))
}

function formatInstallError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const value = error as any
    if (typeof value.message === 'string') return value.message
    if (typeof value.error === 'string') return value.error
  }
  return String(error || t('bundle.messages.unknownError'))
}

</script>

<style lang="scss">
.bundle-install-panel {
  .el-dialog__header {
    padding-right: 36px;
  }

  .el-checkbox {
    margin-right: 0;
    height: 1.5rem;
  }

  .bundle-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .member-main.toggle {
    cursor: pointer;
  }

  // The option checkboxes sit in the columns; notes and the preset editor take a full-width row below.
  .member-details {
    grid-column: 1 / -1;
    display: grid;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .member-desc {
    margin: 0.25rem 0 0;
    color: var(--fg2);
    font-size: 0.8125rem;
  }

  .sensitive-fields {
    display: grid;
    gap: 0.5rem;

    .editor-title {
      color: var(--fg2);
      font-size: 0.8125rem;
    }
  }

  .editor-field {
    display: grid;
    grid-template-columns: minmax(6rem, auto) minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;

    > span {
      color: var(--fg2);
      font-size: 0.8125rem;
      overflow-wrap: anywhere;
    }
  }

  .member-config summary {
    color: var(--k-color-primary);
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .raw-json-editor {
    box-sizing: border-box;
    width: 100%;
    margin-top: 0.5rem;
    border: 1px solid var(--k-color-border);
    border-radius: 4px;
    padding: 0.5rem 0.75rem;
    color: var(--fg1);
    background: var(--k-side-bg);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8125rem;
    resize: vertical;

    &:focus {
      border-color: var(--k-color-primary);
      outline: none;
    }
  }

  .sensitive-value {
    color: var(--fg2);
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
  }
}

@media (max-width: 768px) {
  .bundle-install-panel {
    .editor-field {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }
  }
}
</style>
