<template>
  <el-dialog
    :model-value="!!activeBundle"
    class="bundle-install-panel"
    width="min(860px, calc(100vw - 24px))"
    destroy-on-close
    @update:model-value="close"
  >
    <template #header>
      <div class="bundle-title">
        <span>{{ title }}</span>
        <span class="bundle-badge">插件包</span>
      </div>
    </template>

    <template v-if="activeBundle">
      <k-comment type="warning">
        <p>插件包会一次安装多个依赖，并可写入预设配置。请先检查成员与配置内容，确认后才会写入。市场认证标记来自市场索引，不等同于安全审计。</p>
      </k-comment>

      <div v-if="loading" class="bundle-loading">正在读取插件包清单……</div>
      <k-comment v-else-if="error" type="danger">
        <p>{{ error }}</p>
      </k-comment>

      <template v-else-if="bundle">
        <div class="bundle-summary">
          <div>
            <span class="label">插件包</span>
            <span>{{ activeBundle.package.name }}@{{ bundleVersion }}</span>
          </div>
          <div>
            <span class="label">配置分组</span>
            <span>{{ bundle.label || activeBundle.shortname }}</span>
          </div>
          <div>
            <span class="label">成员</span>
            <span>{{ selectedMembers.length }} / {{ members.length }}</span>
          </div>
          <div>
            <span class="label">配置策略</span>
            <span>默认停用，确认后写入</span>
          </div>
        </div>

        <p v-if="bundle.description" class="bundle-description">{{ bundle.description }}</p>

        <div v-if="validationErrors.length" class="bundle-errors">
          <p v-for="item in validationErrors" :key="item">{{ item }}</p>
        </div>
        <div v-if="validationWarnings.length" class="bundle-warnings">
          <p v-for="item in validationWarnings" :key="item">{{ item }}</p>
        </div>

        <div class="bundle-member-list">
          <section
            v-for="member in members"
            :key="member.package + ':' + member.plugin"
            :class="['bundle-member', { selected: member.selected }]"
            role="checkbox"
            :aria-checked="String(member.selected)"
            tabindex="0"
            @click="toggleMember(member)"
            @keydown.enter.prevent="toggleMember(member)"
            @keydown.space.prevent="toggleMember(member)"
          >
            <div class="member-head">
              <el-checkbox v-model="member.selected" @click.stop>
                <span class="member-name">{{ member.package }}</span>
              </el-checkbox>
              <span :class="['member-kind', member.required ? 'required' : 'optional']">
                {{ member.required ? '核心成员' : '可选成员' }}
              </span>
              <span class="member-version">{{ member.version }}</span>
              <span
                v-for="tag in riskTags(member)"
                :key="tag.label"
                :class="['member-risk', tag.type]"
              >{{ tag.label }}</span>
            </div>

            <div class="member-meta">
              <span>配置键：{{ member.plugin }}</span>
              <span>{{ getInstalledText(member.package) }}</span>
              <span v-if="getPackageDescription(member.package)">{{ getPackageDescription(member.package) }}</span>
            </div>

            <div v-if="memberInfo(member.package)" class="member-meta">
              <span v-if="getAuthor(member.package)">作者：{{ getAuthor(member.package) }}</span>
              <span v-if="getMaintainer(member.package)">维护者：{{ getMaintainer(member.package) }}</span>
              <span v-if="store.market?.data?.[member.package]?.downloads">月下载：{{ store.market.data[member.package].downloads.lastMonth }}</span>
            </div>

            <k-comment v-if="configConflict(member)" type="warning" class="member-warning">
              <p>检测到这个成员已经有独立配置。默认会保留原配置，并在插件包分组下额外创建一个停用副本；也可以选择把已有配置移动到插件包分组。</p>
            </k-comment>

            <div class="member-options" @click.stop>
              <el-checkbox v-model="member.createConfig" :disabled="!member.selected">
                创建停用配置
              </el-checkbox>
              <el-checkbox
                v-if="configConflict(member)"
                v-model="member.move"
                :disabled="!member.selected"
              >
                移动已有配置到插件包分组
              </el-checkbox>
              <el-checkbox v-model="member.usePreset" :disabled="!member.selected || !member.createConfig || member.move || !hasPreset(member)">
                使用预设配置
              </el-checkbox>
            </div>

            <k-comment v-if="sensitiveFields(member).length" type="warning" class="member-warning">
              <p>预设配置包含敏感字段：{{ sensitiveFields(member).join('、') }}</p>
            </k-comment>

            <details v-if="hasPreset(member)" class="member-config" @click.stop>
              <summary>查看完整预设配置</summary>
              <pre>{{ formatConfig(member.config) }}</pre>
            </details>
          </section>
        </div>

        <div class="bundle-diff">
          <h3>即将执行</h3>
          <p>安装依赖：{{ installList.join('，') || '无' }}</p>
          <p>创建停用配置：{{ configList.join('，') || '无' }}</p>
          <p>移动已有配置：{{ moveList.join('，') || '无' }}</p>
          <p>使用预设配置：{{ presetList.join('，') || '无' }}</p>
          <p>跳过配置：{{ skippedConfigList.join('，') || '无' }}</p>
        </div>
      </template>
    </template>

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :loading="installing" :disabled="!canInstall" @click="confirmInstall">
        安装插件包
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">

import { computed, reactive, ref, watch } from 'vue'
import { loading as showLoading, message, send, store, useConfig, useContext } from '@koishijs/client'
import type { Registry } from '@koishijs/registry'
import {
  BundleInstallMember,
  BundleInstallResult,
  PluginBundleManifest,
  hasBundleKeyword,
  parseBundleManifest,
  scanSensitiveConfig,
  validateBundleManifest,
} from '../../src/shared/bundle'
import { activeBundle } from './utils'

const loading = ref(false)
const installing = ref(false)
const error = ref('')
const registry = ref<Registry>()
const bundle = ref<PluginBundleManifest>()
const resolvedBundleVersion = ref('')
const members = reactive<BundleInstallMember[]>([])
const ctx = useContext()
const config = useConfig()

const title = computed(() => activeBundle.value?.shortname || activeBundle.value?.package.name || '插件包')
const bundleVersion = computed(() => resolvedBundleVersion.value || activeBundle.value?.package.version || '')
const validation = computed(() => {
  if (!activeBundle.value || !bundle.value) return { valid: false, errors: [], warnings: [] }
  return validateBundleManifest(activeBundle.value.package.name, bundle.value, {
    keyword: hasBundleKeyword(activeBundle.value.package.keywords),
  })
})
const validationErrors = computed(() => validation.value.errors)
const validationWarnings = computed(() => validation.value.warnings)
const selectedMembers = computed(() => members.filter(member => member.selected))
const installList = computed(() => {
  if (!activeBundle.value) return []
  return [
    `${activeBundle.value.package.name}@${bundleVersion.value}`,
    ...selectedMembers.value.map(member => `${member.package}@${member.version}`),
  ]
})
const configList = computed(() => selectedMembers.value
  .filter(member => member.createConfig && !member.move)
  .map(member => member.plugin))
const moveList = computed(() => selectedMembers.value
  .filter(member => member.move)
  .map(member => member.plugin))
const presetList = computed(() => selectedMembers.value
  .filter(member => member.createConfig && member.usePreset && !member.move)
  .map(member => member.plugin))
const skippedConfigList = computed(() => selectedMembers.value
  .filter(member => !member.createConfig && !member.move)
  .map(member => member.plugin))
const canInstall = computed(() => !!activeBundle.value && !!bundle.value && validation.value.valid && selectedMembers.value.length > 0 && !loading.value)

watch(activeBundle, async (value) => {
  error.value = ''
  registry.value = undefined
  bundle.value = undefined
  resolvedBundleVersion.value = ''
  members.splice(0)
  if (!value) return
  loading.value = true
  try {
    const data = await send('market/package', value.package.name) as Registry
    registry.value = data
    const remoteEntry = data.versions?.[value.package.version]
      ? [value.package.version, data.versions[value.package.version]] as const
      : Object.entries(data.versions ?? {})[0]
    if (!remoteEntry) {
      error.value = '没有读取到这个插件包的 npm 版本元数据。'
      return
    }
    const [remoteVersion, remote] = remoteEntry
    const parsed = parseBundleManifest(remote?.koishi?.bundle)
    if (!parsed) {
      error.value = '这个包被识别为插件包，但没有提供 koishi.bundle 清单，不能执行展开安装。'
      return
    }
    resolvedBundleVersion.value = remoteVersion
    bundle.value = parsed
    for (const member of parsed.members) {
      const conflict = hasExistingConfig(member)
      members.push({
        ...member,
        selected: !!member.required,
        createConfig: true,
        usePreset: !conflict && !!member.config && Object.keys(member.config).length > 0,
        move: false,
      })
    }
    const names = parsed.members.map(member => member.package).filter(name => !store.registry?.[name])
    if (names.length) {
      const result = await send('market/registry', names).catch(() => undefined)
      if (result) store.registry = { ...store.registry, ...result }
    }
  } catch (err) {
    console.error(err)
    error.value = err instanceof Error ? err.message : '读取插件包清单失败。'
  } finally {
    loading.value = false
  }
}, { immediate: true })

function memberInfo(name: string) {
  return store.market?.data?.[name]
}

function getPackageDescription(name: string) {
  const data = memberInfo(name)
  const description = data?.manifest?.description || data?.package?.description
  if (typeof description === 'string') return description
  if (description && typeof description === 'object') {
    return description['zh-CN'] || description.zh || description['en-US'] || description.en || Object.values(description).find(Boolean)
  }
}

function formatUser(user: any) {
  if (!user) return ''
  if (typeof user === 'string') return user
  return user.name || user.username || user.email || ''
}

function getAuthor(name: string) {
  return formatUser(memberInfo(name)?.package?.author)
}

function getMaintainer(name: string) {
  return formatUser(memberInfo(name)?.package?.maintainers?.[0])
}

function getInstalledText(name: string) {
  const dep = store.dependencies?.[name]
  if (dep?.resolved) return `已安装：${dep.resolved}`
  if (store.packages?.[name]) return `已加载：${store.packages[name].package.version}`
  return '未安装'
}

function hasExistingConfig(member: BundleInstallMember) {
  if (!ctx.configWriter) return false
  return !!(ctx.configWriter.get(member.package)?.length || ctx.configWriter.get(member.plugin)?.length)
}

function configConflict(member: BundleInstallMember) {
  return hasExistingConfig(member) ? 'other-config' : undefined
}

function versionMeta(member: BundleInstallMember) {
  return store.registry?.[member.package]?.[member.version]
}

function riskTags(member: BundleInstallMember) {
  const data = memberInfo(member.package)
  const tags: Array<{ label: string, type: string }> = []
  if (!data) tags.push({ label: '未进入市场索引', type: 'warning' })
  if (data?.verified) tags.push({ label: '市场认证', type: 'success' })
  if (data?.insecure) tags.push({ label: '安全风险', type: 'danger' })
  if (data?.deprecated || versionMeta(member)?.deprecated) tags.push({ label: '已废弃', type: 'danger' })
  if (data?.manifest?.preview) tags.push({ label: '预览版', type: 'warning' })
  if (data?.portable) tags.push({ label: '可移植', type: 'info' })
  if (hasPreset(member)) tags.push({ label: '含预设配置', type: 'warning' })
  return tags
}

function hasPreset(member: BundleInstallMember) {
  return !!member.config && Object.keys(member.config).length > 0
}

function sensitiveFields(member: BundleInstallMember) {
  return scanSensitiveConfig(member.config)
}

function formatConfig(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2)
}

function toggleMember(member: BundleInstallMember) {
  member.selected = !member.selected
}

function close() {
  if (installing.value) return
  activeBundle.value = undefined
}

async function confirmInstall() {
  if (!activeBundle.value || !bundle.value || installing.value) return
  installing.value = true
  const instance = showLoading({ text: '正在安装插件包……' })
  try {
    const result = await send('market/install-bundle', {
      package: activeBundle.value.package.name,
      version: bundleVersion.value,
      bundle: bundle.value,
      members: members.map(member => ({
        ...member,
        createConfig: member.createConfig || !!member.move,
      })),
    }) as BundleInstallResult
    if (result?.code) {
      message.error('插件包安装失败。')
      return
    }
    if (result?.record) {
      config.value.market.bundleRecords ||= {}
      config.value.market.bundleRecords[result.record.package] = result.record
    }
    const moved = result?.moved?.length ? `，移动配置 ${result.moved.length} 项` : ''
    const skipped = result?.skipped?.length ? `，跳过配置 ${result.skipped.length} 项` : ''
    message.success(`插件包安装完成${moved}${skipped}。`)
    activeBundle.value = undefined
  } catch (err) {
    console.error(err)
    message.error('插件包安装失败。')
  } finally {
    installing.value = false
    instance.close()
  }
}

</script>

<style lang="scss">

.bundle-install-panel {
  .bundle-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .bundle-badge,
  .member-kind {
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
    font-size: 12px;
    border: 1px solid var(--k-color-border);
    background: color-mix(in srgb, var(--k-color-primary) 10%, transparent);
    color: var(--k-color-primary);
  }

  .bundle-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.35rem 0.8rem;
    margin: 0.65rem 0;
    font-size: 12px;

    .label {
      color: var(--fg2);
      margin-right: 0.5rem;
    }
  }

  .bundle-description {
    margin: 0.45rem 0;
    color: var(--fg2);
  }

  .bundle-errors {
    color: var(--k-color-danger);
    margin: 0.75rem 0;
  }

  .bundle-warnings {
    margin: 0.55rem 0;
    border: 1px solid color-mix(in srgb, var(--k-color-warning) 34%, var(--k-color-border));
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
    color: var(--k-color-warning);
    background: color-mix(in srgb, var(--k-color-warning) 9%, transparent);

    p {
      margin: 0.2rem 0;
    }
  }

  .bundle-member-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 48vh;
    overflow: auto;
    padding-right: 0.25rem;
  }

  .bundle-member {
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
    background: var(--k-card-bg);
    transition: border-color 0.16s ease, background 0.16s ease;
    cursor: pointer;
    outline: none;

    &.selected {
      border-color: color-mix(in srgb, var(--k-color-primary) 36%, var(--k-color-border));
      background:
        linear-gradient(90deg, color-mix(in srgb, var(--k-color-primary) 6%, transparent), transparent 44%),
        var(--k-card-bg);
    }

    &:hover,
    &:focus-visible {
      border-color: color-mix(in srgb, var(--k-color-primary) 32%, var(--k-color-border));
    }
  }

  .member-head,
  .member-meta,
  .member-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.6rem;
    align-items: center;
  }

  .member-name {
    font-weight: 600;
  }

  .member-kind.required {
    color: var(--k-color-danger);
    background: color-mix(in srgb, var(--k-color-danger) 10%, transparent);
  }

  .member-kind.optional {
    color: var(--fg2);
  }

  .member-version {
    font-family: var(--font-mono);
    color: var(--fg2);
  }

  .member-risk {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 0.1rem 0.45rem;
    font-size: 12px;
    line-height: 1.35;
    color: var(--fg2);
    background: color-mix(in srgb, var(--fg3) 10%, transparent);

    &.success {
      color: var(--k-color-success);
      background: color-mix(in srgb, var(--k-color-success) 10%, transparent);
    }

    &.danger {
      color: var(--k-color-danger);
      background: color-mix(in srgb, var(--k-color-danger) 10%, transparent);
    }

    &.warning {
      color: var(--k-color-warning);
      background: color-mix(in srgb, var(--k-color-warning) 11%, transparent);
    }

    &.info {
      color: var(--k-color-primary);
      background: color-mix(in srgb, var(--k-color-primary) 10%, transparent);
    }
  }

  .member-meta {
    margin-top: 0.28rem;
    color: var(--fg2);
    font-size: 12px;
    line-height: 1.35;
  }

  .member-options {
    margin-top: 0.42rem;
    cursor: default;
  }

  .member-warning.k-comment {
    margin: 0.45rem 0 0;
  }

  .member-config {
    margin-top: 0.45rem;
    cursor: default;

    summary {
      cursor: pointer;
      color: var(--k-color-primary);
    }

    pre {
      margin: 0.5rem 0 0;
      padding: 0.6rem;
      border-radius: 6px;
      overflow: auto;
      background: var(--k-color-code-bg, rgb(0 0 0 / 8%));
      font-size: 12px;
    }
  }

  .bundle-diff {
    margin-top: 0.75rem;
    padding: 0.6rem 0.7rem;
    border-radius: 8px;
    background: color-mix(in srgb, var(--k-color-primary) 6%, transparent);
    font-size: 12px;

    h3 {
      margin: 0 0 0.35rem;
      font-size: 13px;
    }

    p {
      margin: 0.18rem 0;
      color: var(--fg2);
    }
  }

  @media (max-width: 640px) {
    .el-dialog__body {
      max-height: calc(100vh - 132px);
      overflow: auto;
      padding: 0 12px 12px;
    }

    .bundle-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.3rem 0.55rem;
      margin: 0.5rem 0;
    }

    .bundle-member-list {
      max-height: none;
      overflow: visible;
      padding-right: 0;
    }

    .bundle-member {
      padding: 0.48rem 0.52rem;
    }

    .bundle-badge,
    .member-kind,
    .member-risk {
      padding: 0.06rem 0.38rem;
      font-size: 11px;
    }

    .member-head,
    .member-meta,
    .member-options {
      gap: 0.28rem 0.45rem;
    }

    .member-options {
      display: grid;
      grid-template-columns: 1fr;
    }

    .bundle-diff {
      padding: 0.55rem;
    }
  }
}

</style>
