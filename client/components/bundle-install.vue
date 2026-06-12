<template>
  <el-dialog
    :model-value="!!activeBundle"
    class="bundle-install-panel"
    width="min(880px, calc(100vw - 24px))"
    destroy-on-close
    @update:model-value="close"
  >
    <template #header>
      <div class="bundle-hero">
        <div class="bundle-hero-icon">
          <k-icon name="cube"></k-icon>
        </div>
        <div class="bundle-hero-text">
          <div class="bundle-hero-title">
            <span>{{ title }}</span>
            <span class="bundle-badge">插件包</span>
          </div>
          <div v-if="activeBundle" class="bundle-hero-meta">
            <span>{{ activeBundle.package.name }}</span>
            <span class="dot">·</span>
            <span>{{ bundleVersion }}</span>
          </div>
        </div>
      </div>
    </template>

    <template v-if="activeBundle">
      <div v-if="loading" class="bundle-loading">
        <span class="bundle-loading-spinner"></span>
        正在读取插件包清单……
      </div>
      <k-comment v-else-if="error" type="danger">
        <p>{{ error }}</p>
      </k-comment>

      <template v-else-if="bundle">
        <p v-if="bundle.description" class="bundle-description">{{ bundle.description }}</p>

        <!-- Stats row: visual progress + counts -->
        <div class="bundle-stats">
          <div class="bundle-stat">
            <span class="bundle-stat-num">{{ selectedMembers.length }}</span>
            <span class="bundle-stat-label">已选 / {{ members.length }} 成员</span>
            <div class="bundle-stat-bar"><div class="bundle-stat-fill" :style="{ width: progressPercent + '%' }"></div></div>
          </div>
          <div class="bundle-stat">
            <span class="bundle-stat-num">{{ presetList.length }}</span>
            <span class="bundle-stat-label">将应用预设</span>
          </div>
          <div class="bundle-stat">
            <span class="bundle-stat-num">{{ moveList.length }}</span>
            <span class="bundle-stat-label">将移动配置</span>
          </div>
        </div>

        <k-comment v-if="validationErrors.length" type="danger">
          <p v-for="item in validationErrors" :key="item">{{ item }}</p>
        </k-comment>
        <k-comment v-if="validationWarnings.length" type="warning">
          <p v-for="item in validationWarnings" :key="item">{{ item }}</p>
        </k-comment>

        <!-- Required members section -->
        <template v-if="requiredMembers.length">
          <div class="bundle-section-title">
            <k-icon name="check-full"></k-icon>
            核心成员 <span class="bundle-section-count">{{ requiredMembers.length }}</span>
          </div>
          <div class="bundle-member-list">
            <section
              v-for="member in requiredMembers"
              :key="member.package + ':' + member.plugin"
              :class="['bundle-member required', { selected: member.selected }]"
            >
              <div class="member-row">
                <div :class="['member-icon', 'cat-' + memberCategory(member.package)]">
                  <market-icon :name="'outline:' + memberCategory(member.package)"></market-icon>
                </div>
                <div class="member-main">
                  <div class="member-line">
                    <span class="member-name">{{ formatShortname(member.package) }}</span>
                    <span class="member-version">{{ member.version }}</span>
                    <span
                      v-for="tag in riskTags(member)"
                      :key="tag.label"
                      :class="['member-risk', tag.type]"
                    >{{ tag.label }}</span>
                  </div>
                  <div class="member-sub">
                    <span class="member-fullname">{{ member.package }}</span>
                    <span class="dot">·</span>
                    <span>{{ getInstalledText(member.package) }}</span>
                  </div>
                  <p v-if="getPackageDescription(member.package)" class="member-desc">
                    {{ getPackageDescription(member.package) }}
                  </p>
                </div>
                <div class="member-side">
                  <span class="member-required-pill">
                    <k-icon name="lock"></k-icon>
                    必装
                  </span>
                </div>
              </div>

              <div class="member-options" v-if="member.selected">
                <el-checkbox v-model="member.createConfig">创建停用配置</el-checkbox>
                <el-checkbox
                  v-if="configConflict(member)"
                  v-model="member.move"
                >移动已有配置</el-checkbox>
                <el-checkbox v-model="member.usePreset" :disabled="!member.createConfig || member.move || !hasPreset(member)">使用预设</el-checkbox>
              </div>

              <k-comment v-if="configConflict(member)" type="warning" class="member-warning">
                <p>已有独立配置，默认在插件包分组下创建停用副本；勾选"移动"可整体迁移。</p>
              </k-comment>

              <k-comment v-if="sensitiveFields(member).length && member.selected && member.usePreset" type="warning" class="member-warning">
                <p>预设包含敏感字段：{{ sensitiveFields(member).join('、') }}</p>
              </k-comment>

              <details v-if="hasPreset(member) && member.selected" class="member-config" @click.stop>
                <summary>查看预设</summary>
                <pre>{{ formatConfig(member.config) }}</pre>
              </details>
            </section>
          </div>
        </template>

        <!-- Optional members section -->
        <template v-if="optionalMembers.length">
          <div class="bundle-section-title">
            <k-icon name="info-full"></k-icon>
            可选成员 <span class="bundle-section-count">{{ optionalMembers.length }}</span>
            <button class="bundle-section-action" @click="toggleAllOptional">
              {{ allOptionalSelected ? '全部取消' : '全部选中' }}
            </button>
          </div>
          <div class="bundle-member-list">
            <section
              v-for="member in optionalMembers"
              :key="member.package + ':' + member.plugin"
              :class="['bundle-member optional', { selected: member.selected }]"
              role="checkbox"
              :aria-checked="String(member.selected)"
              tabindex="0"
              @click="toggleMember(member)"
              @keydown.enter.prevent="toggleMember(member)"
              @keydown.space.prevent="toggleMember(member)"
            >
              <div class="member-row">
                <el-checkbox :model-value="member.selected" @click.stop @change="toggleMember(member)" class="member-check"></el-checkbox>
                <div :class="['member-icon', 'cat-' + memberCategory(member.package)]">
                  <market-icon :name="'outline:' + memberCategory(member.package)"></market-icon>
                </div>
                <div class="member-main">
                  <div class="member-line">
                    <span class="member-name">{{ formatShortname(member.package) }}</span>
                    <span class="member-version">{{ member.version }}</span>
                    <span
                      v-for="tag in riskTags(member)"
                      :key="tag.label"
                      :class="['member-risk', tag.type]"
                    >{{ tag.label }}</span>
                  </div>
                  <div class="member-sub">
                    <span class="member-fullname">{{ member.package }}</span>
                    <span class="dot">·</span>
                    <span>{{ getInstalledText(member.package) }}</span>
                  </div>
                  <p v-if="getPackageDescription(member.package)" class="member-desc">
                    {{ getPackageDescription(member.package) }}
                  </p>
                </div>
              </div>

              <div class="member-options" v-if="member.selected" @click.stop>
                <el-checkbox v-model="member.createConfig">创建停用配置</el-checkbox>
                <el-checkbox
                  v-if="configConflict(member)"
                  v-model="member.move"
                >移动已有配置</el-checkbox>
                <el-checkbox v-model="member.usePreset" :disabled="!member.createConfig || member.move || !hasPreset(member)">使用预设</el-checkbox>
              </div>

              <k-comment v-if="configConflict(member) && member.selected" type="warning" class="member-warning">
                <p>已有独立配置，默认在插件包分组下创建停用副本；勾选"移动"可整体迁移。</p>
              </k-comment>

              <k-comment v-if="sensitiveFields(member).length && member.selected && member.usePreset" type="warning" class="member-warning">
                <p>预设包含敏感字段：{{ sensitiveFields(member).join('、') }}</p>
              </k-comment>

              <details v-if="hasPreset(member) && member.selected" class="member-config" @click.stop>
                <summary>查看预设</summary>
                <pre>{{ formatConfig(member.config) }}</pre>
              </details>
            </section>
          </div>
        </template>

        <!-- Diff: visualized -->
        <div class="bundle-diff">
          <div class="bundle-diff-title">即将执行</div>
          <div class="bundle-diff-grid">
            <div class="bundle-diff-cell">
              <div class="bundle-diff-head"><k-icon name="cube"></k-icon> 安装依赖 <strong>{{ installList.length }}</strong></div>
              <div class="bundle-diff-tags">
                <span v-for="item in installList" :key="item" class="bundle-diff-tag install">{{ item }}</span>
              </div>
            </div>
            <div class="bundle-diff-cell" v-if="configList.length || presetList.length">
              <div class="bundle-diff-head"><k-icon name="settings"></k-icon> 创建配置 <strong>{{ configList.length }}</strong></div>
              <div class="bundle-diff-tags">
                <span v-for="item in configList" :key="item" :class="['bundle-diff-tag config', { 'with-preset': presetList.includes(item) }]">
                  {{ item }}
                  <span v-if="presetList.includes(item)" class="preset-marker">预设</span>
                </span>
              </div>
            </div>
            <div class="bundle-diff-cell" v-if="moveList.length">
              <div class="bundle-diff-head"><k-icon name="arrow-right"></k-icon> 移动配置 <strong>{{ moveList.length }}</strong></div>
              <div class="bundle-diff-tags">
                <span v-for="item in moveList" :key="item" class="bundle-diff-tag move">{{ item }}</span>
              </div>
            </div>
            <div class="bundle-diff-cell" v-if="skippedConfigList.length">
              <div class="bundle-diff-head"><k-icon name="info-full"></k-icon> 跳过配置 <strong>{{ skippedConfigList.length }}</strong></div>
              <div class="bundle-diff-tags">
                <span v-for="item in skippedConfigList" :key="item" class="bundle-diff-tag skip">{{ item }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :loading="installing" :disabled="!canInstall" @click="confirmInstall">
        安装插件包 <span v-if="selectedMembers.length" class="footer-count">({{ selectedMembers.length }})</span>
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
import { resolveCategory } from '../market/utils'
import MarketIcon from '../market/icons'

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
const requiredMembers = computed(() => members.filter(m => m.required))
const optionalMembers = computed(() => members.filter(m => !m.required))
const progressPercent = computed(() => members.length ? Math.round(selectedMembers.value.length / members.length * 100) : 0)
const allOptionalSelected = computed(() => optionalMembers.value.length > 0 && optionalMembers.value.every(m => m.selected))

function toggleAllOptional() {
  const target = !allOptionalSelected.value
  for (const m of optionalMembers.value) m.selected = target
}

function memberCategory(name: string) {
  const data = store.market?.data?.[name]
  return resolveCategory(data?.category)
}

function formatShortname(name: string) {
  const shortname = store.market?.data?.[name]?.shortname
  if (shortname && shortname !== name) return shortname
  if (name.startsWith('@koishijs/plugin-')) return name.slice('@koishijs/plugin-'.length)
  if (name.startsWith('koishi-plugin-')) return name.slice('koishi-plugin-'.length)
  const scoped = name.match(/^@([^/]+)\/koishi-plugin-(.+)$/)
  if (scoped) return `@${scoped[1]}/${scoped[2]}`
  return name
}
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
  --bundle-color: #8b5cf6;
  --bundle-color-soft: color-mix(in srgb, var(--bundle-color) 12%, transparent);
  --bundle-color-border: color-mix(in srgb, var(--bundle-color) 32%, var(--k-color-border));

  .el-dialog__header { padding-bottom: 0.5rem; }

  // Hero
  .bundle-hero {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .bundle-hero-icon {
    flex: 0 0 auto;
    width: 2.6rem;
    height: 2.6rem;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--bundle-color) 26%, transparent),
      color-mix(in srgb, var(--bundle-color) 12%, transparent));
    color: var(--bundle-color);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 14%), 0 4px 14px color-mix(in srgb, var(--bundle-color) 18%, transparent);
    .k-icon { width: 1.4rem; height: 1.4rem; }
  }

  .bundle-hero-text {
    flex: 1 1 auto;
    min-width: 0;
  }

  .bundle-hero-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .bundle-badge {
    font-size: 0.7rem;
    padding: 0.08rem 0.45rem;
    border-radius: 999px;
    color: var(--bundle-color);
    background: var(--bundle-color-soft);
    border: 1px solid var(--bundle-color-border);
    font-weight: 500;
  }

  .bundle-hero-meta {
    margin-top: 0.15rem;
    font-size: 0.78rem;
    color: var(--fg3);
    display: flex;
    gap: 0.35rem;
    .dot { opacity: 0.5; }
  }

  // Description
  .bundle-description {
    margin: 0.7rem 0 0.5rem;
    color: var(--fg1);
    font-size: 0.88rem;
    line-height: 1.5;
  }

  // Stats row
  .bundle-stats {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    gap: 0.6rem;
    margin: 0.65rem 0 0.85rem;
  }

  .bundle-stat {
    position: relative;
    padding: 0.55rem 0.7rem 0.55rem;
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bundle-color) 4%, var(--k-card-bg));
    overflow: hidden;
  }

  .bundle-stat-num {
    display: block;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--bundle-color);
    line-height: 1.1;
  }

  .bundle-stat-label {
    display: block;
    margin-top: 0.15rem;
    font-size: 0.72rem;
    color: var(--fg2);
  }

  .bundle-stat-bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    width: 100%;
    background: color-mix(in srgb, var(--bundle-color) 10%, transparent);
  }

  .bundle-stat-fill {
    height: 100%;
    background: linear-gradient(90deg,
      color-mix(in srgb, var(--bundle-color) 60%, transparent),
      var(--bundle-color));
    transition: width 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  // Section title
  .bundle-section-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0.95rem 0 0.45rem;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg2);

    .k-icon { width: 0.9rem; height: 0.9rem; color: var(--bundle-color); }
  }

  .bundle-section-count {
    font-size: 0.7rem;
    color: var(--fg3);
    font-weight: 500;
    text-transform: none;
  }

  .bundle-section-action {
    margin-left: auto;
    border: none;
    background: none;
    color: var(--bundle-color);
    cursor: pointer;
    font-size: 0.74rem;
    padding: 2px 6px;
    border-radius: 4px;
    transition: background 0.15s;
    &:hover { background: var(--bundle-color-soft); }
  }

  // Member list
  .bundle-member-list {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    max-height: 38vh;
    overflow: auto;
    padding: 2px;
  }

  .bundle-member {
    border: 1px solid var(--k-color-border);
    border-radius: 8px;
    padding: 0.6rem 0.7rem;
    background: var(--k-card-bg);
    transition: border-color 0.18s, background 0.18s, box-shadow 0.18s, transform 0.18s;

    &.optional {
      cursor: pointer;
      &:hover, &:focus-visible {
        border-color: var(--bundle-color-border);
        outline: none;
      }
    }

    &.selected {
      border-color: var(--bundle-color-border);
      background: linear-gradient(90deg, var(--bundle-color-soft), transparent 50%), var(--k-card-bg);
      box-shadow: inset 3px 0 0 var(--bundle-color);
    }

    &.required {
      background: linear-gradient(90deg, color-mix(in srgb, var(--k-color-success) 4%, transparent), transparent 50%), var(--k-card-bg);
      box-shadow: inset 3px 0 0 var(--k-color-success);
    }
  }

  .member-row {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
  }

  .member-check { flex: 0 0 auto; margin-top: 2px; }

  .member-icon {
    flex: 0 0 auto;
    width: 2.1rem;
    height: 2.1rem;
    display: grid;
    place-items: center;
    border-radius: 8px;
    border: 1px solid transparent;
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--c, var(--fg3)) 18%, var(--k-card-bg)),
      color-mix(in srgb, var(--c, var(--fg3)) 8%, var(--k-card-bg)));
    border-color: color-mix(in srgb, var(--c, var(--fg3)) 28%, var(--k-color-border));
    color: var(--c, var(--fg2));

    .market-icon { width: 1.05rem; height: 1.05rem; }

    &.cat-adapter    { --c: #38bdf8; }
    &.cat-general    { --c: #4ade80; }
    &.cat-extension  { --c: #a78bfa; }
    &.cat-webui      { --c: #fb923c; }
    &.cat-manage     { --c: #facc15; }
    &.cat-preset     { --c: #60a5fa; }
    &.cat-image      { --c: #f472b6; }
    &.cat-media      { --c: #e879f9; }
    &.cat-tool       { --c: #94a3b8; }
    &.cat-life       { --c: #34d399; }
    &.cat-ai         { --c: #818cf8; }
    &.cat-meme       { --c: #fbbf24; }
    &.cat-game       { --c: #f87171; }
    &.cat-gametool   { --c: #c084fc; }
    &.cat-other      { --c: #64748b; }
  }

  .member-main { flex: 1 1 auto; min-width: 0; }

  .member-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }

  .member-name {
    font-weight: 600;
    font-size: 0.92rem;
  }

  .member-version {
    font-family: var(--font-mono, monospace);
    font-size: 0.74rem;
    color: var(--fg3);
    padding: 0 0.32rem;
    border-radius: 4px;
    background: color-mix(in srgb, var(--fg3) 10%, transparent);
  }

  .member-sub {
    margin-top: 0.18rem;
    font-size: 0.72rem;
    color: var(--fg3);
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
    .dot { opacity: 0.4; }
  }

  .member-fullname {
    font-family: var(--font-mono, monospace);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 22rem;
  }

  .member-desc {
    margin: 0.28rem 0 0;
    font-size: 0.78rem;
    color: var(--fg2);
    line-height: 1.4;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .member-side { flex: 0 0 auto; }

  .member-required-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.1rem 0.45rem;
    font-size: 0.68rem;
    border-radius: 999px;
    color: var(--k-color-success);
    background: color-mix(in srgb, var(--k-color-success) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--k-color-success) 28%, var(--k-color-border));
    .k-icon { width: 0.7rem; height: 0.7rem; }
  }

  .member-risk {
    display: inline-flex;
    align-items: center;
    border-radius: 4px;
    padding: 0.05rem 0.4rem;
    font-size: 0.68rem;
    line-height: 1.4;
    color: var(--fg2);
    background: color-mix(in srgb, var(--fg3) 10%, transparent);
    font-weight: 500;

    &.success { color: var(--k-color-success); background: color-mix(in srgb, var(--k-color-success) 12%, transparent); }
    &.danger  { color: var(--k-color-danger);  background: color-mix(in srgb, var(--k-color-danger) 12%, transparent); }
    &.warning { color: var(--k-color-warning); background: color-mix(in srgb, var(--k-color-warning) 14%, transparent); }
    &.info    { color: var(--k-color-primary); background: color-mix(in srgb, var(--k-color-primary) 12%, transparent); }
  }

  .member-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.85rem;
    margin: 0.5rem 0 0 2.75rem;
    padding-top: 0.45rem;
    border-top: 1px dashed color-mix(in srgb, var(--k-color-border) 60%, transparent);
    cursor: default;
    font-size: 0.82rem;
  }

  .member-warning.k-comment {
    margin: 0.45rem 0 0 2.75rem;
  }

  .member-config {
    margin: 0.5rem 0 0 2.75rem;
    cursor: default;

    summary {
      cursor: pointer;
      color: var(--bundle-color);
      font-size: 0.78rem;
      user-select: none;
    }

    pre {
      margin: 0.4rem 0 0;
      padding: 0.55rem 0.7rem;
      border-radius: 6px;
      overflow: auto;
      background: color-mix(in srgb, var(--bundle-color) 5%, var(--k-color-code-bg, rgb(0 0 0 / 8%)));
      border: 1px solid color-mix(in srgb, var(--bundle-color) 14%, transparent);
      font-size: 0.74rem;
      max-height: 16rem;
    }
  }

  // Diff
  .bundle-diff {
    margin-top: 1rem;
    padding: 0.7rem 0.85rem;
    border-radius: 10px;
    background: linear-gradient(135deg, var(--bundle-color-soft), transparent 60%), color-mix(in srgb, var(--k-side-bg) 70%, transparent);
    border: 1px solid var(--bundle-color-border);
  }

  .bundle-diff-title {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--bundle-color);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.5rem;
  }

  .bundle-diff-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.6rem;
  }

  .bundle-diff-cell {
    background: var(--k-card-bg);
    border: 1px solid color-mix(in srgb, var(--k-color-border) 70%, transparent);
    border-radius: 6px;
    padding: 0.5rem 0.6rem;
  }

  .bundle-diff-head {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--fg1);

    .k-icon { width: 0.85rem; height: 0.85rem; color: var(--bundle-color); }
    strong {
      margin-left: auto;
      color: var(--bundle-color);
      font-weight: 700;
    }
  }

  .bundle-diff-tags {
    margin-top: 0.4rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .bundle-diff-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.08rem 0.42rem;
    font-size: 0.7rem;
    border-radius: 4px;
    border: 1px solid transparent;
    background: color-mix(in srgb, var(--fg3) 8%, transparent);
    color: var(--fg2);

    &.install { color: var(--k-color-success); background: color-mix(in srgb, var(--k-color-success) 10%, transparent); border-color: color-mix(in srgb, var(--k-color-success) 25%, transparent); }
    &.config  { color: var(--k-color-primary); background: color-mix(in srgb, var(--k-color-primary) 10%, transparent); border-color: color-mix(in srgb, var(--k-color-primary) 25%, transparent); }
    &.move    { color: var(--k-color-warning); background: color-mix(in srgb, var(--k-color-warning) 10%, transparent); border-color: color-mix(in srgb, var(--k-color-warning) 25%, transparent); }
    &.skip    { color: var(--fg3); }

    .preset-marker {
      font-size: 0.62rem;
      padding: 0 0.25rem;
      border-radius: 3px;
      background: color-mix(in srgb, var(--bundle-color) 18%, transparent);
      color: var(--bundle-color);
    }
  }

  .footer-count {
    margin-left: 0.3rem;
    font-weight: 700;
    font-size: 0.85em;
    opacity: 0.85;
  }

  // Loading
  .bundle-loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 0;
    color: var(--fg2);
  }

  .bundle-loading-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid color-mix(in srgb, var(--bundle-color) 30%, transparent);
    border-top-color: var(--bundle-color);
    border-radius: 50%;
    animation: bundle-spin 0.7s linear infinite;
  }

  @keyframes bundle-spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 640px) {
    .el-dialog__body {
      max-height: calc(100vh - 132px);
      overflow: auto;
      padding: 0 12px 12px;
    }

    .bundle-stats { grid-template-columns: 1fr 1fr; }
    .bundle-stat:first-child { grid-column: 1 / -1; }

    .bundle-member-list { max-height: none; overflow: visible; }

    .member-options, .member-warning.k-comment, .member-config { margin-left: 0; }
  }
}

</style>
