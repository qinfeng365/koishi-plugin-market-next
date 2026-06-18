<template>
  <a :class="['market-package flex gap-3', 'cat-' + resolveCategory(data.category), config.layout === 'list' ? 'list-mode flex-row' : 'flex-col', { 'bundle-card': bundlePackage }]" target="_blank" :href="homepage">
    <div class="header flex flex-row gap-4">
      <div :class="['left', 'shrink-0', 'flex', 'flex-row', 'justify-center', 'items-center', 'cat-' + resolveCategory(data.category)]">
        <market-icon :name="'outline:' + resolveCategory(data.category)"></market-icon>
      </div>
      <div class="main flex flex-col justify-around overflow-hidden">
        <h2 class="top">
          <span class="title truncate" :title="data.shortname">{{ data.shortname }}</span>
          <el-tooltip v-if="badge" placement="right" :content="t(`badge.${badge.type}`)">
            <span :class="['icon', badge.type]" @click.stop.prevent="$emit('query', badge.query)">
              <market-icon :name="badge.icon || badge.type"></market-icon>
            </span>
          </el-tooltip>
        </h2>
        <div class="bottom">
          <span class="updated-meta">
            <market-icon name="heart-pulse"></market-icon>{{ updatedAgo(data.updatedAt) }}
          </span>
        </div>
      </div>
      <div class="text-right grow-1 shrink-0">
        <slot name="action"></slot>
      </div>
    </div>
    <k-markdown inline class="desc" :source="tt(data.manifest?.description) ?? ''"></k-markdown>
    <div class="footer">
      <el-tooltip :content="timeAgo(data.updatedAt)" placement="top">
        <a class="truncate" target="_blank" :href="data.package.links.npm">
          <market-icon name="tag"></market-icon>{{ data.package.version }}
        </a>
      </el-tooltip>
      <template v-if="data.installSize">
        <span class="spacer"></span>
        <a class="truncate" target="_blank" :href="data.package.links.size">
          <market-icon name="file-archive"></market-icon>{{ formatSize(data.installSize) }}
        </a>
      </template>
      <template v-if="data.downloads">
        <span class="spacer"></span>
        <span class="truncate">
          <market-icon name="download"></market-icon>{{ data.downloads.lastMonth }}
        </span>
      </template>
      <template v-if="!data.installSize && !data.downloads">
        <span class="spacer"></span>
        <span class="truncate">
          <market-icon name="balance"></market-icon>{{ data.license }}
        </span>
      </template>
      <span class="long-spacer"></span>
      <div class="avatars">
        <el-tooltip v-for="view in avatarViews" :key="view.key" :content="view.label" placement="top">
          <span
            class="avatar"
            :class="{ placeholder: !view.src }"
            :data-initial="view.initial"
            @click.stop.prevent="view.user.email && $emit('query', 'email:' + view.user.email)"
          >
            <img
              v-if="view.src"
              :key="view.src"
              :src="view.src"
              loading="lazy"
              decoding="async"
              @error="handleAvatarRenderError(view)"
              @load="handleAvatarRenderLoad(view)"
            >
          </span>
        </el-tooltip>
      </div>
    </div>
  </a>
</template>

<script lang="ts" setup>

import { computed, inject, ref, watch } from 'vue'
import { SearchObject } from '@koishijs/registry'
import { useI18nText } from '@koishijs/components'
import { badges, cacheAvatarFailure, fetchAndCacheAvatar, fetchCachedAvatar, getCachedAvatarFromCandidates, getUserAvatarCandidates, getUserKey, getUsers, isAvatarFailureCached, isBundleSearchObject, resolveCategory, validate } from '../utils'
import { kConfig } from '../utils'
import { useI18n } from 'vue-i18n'
import zhCN from '../locales/zh-CN.yml'
import MarketIcon from '../icons'

defineEmits(['query'])

const props = defineProps<{
  data: SearchObject
  gravatar?: string
}>()

const config = inject(kConfig, {})
const avatars = ref<Record<string, string>>({})
const avatarCursor = ref<Record<string, number>>({})
const avatarTasks = new Map<string, Promise<void>>()

const tt = useI18nText()

const homepage = computed(() => {
  const { homepage, repository } = props.data.package.links
  if (homepage) return homepage
  if (repository) return repository.replace(/^git\+/, '').replace(/\.git$/, '')
})

const badge = computed(() => {
  if (bundlePackage.value) {
    return {
      type: 'bundle',
      query: 'is:bundle',
      negate: 'not:bundle',
      icon: 'file-archive',
    }
  }
  for (const type in badges) {
    if (badges[type].hidden?.(config, 'card')) continue
    if (validate(props.data, badges[type].query)) return { type, ...badges[type] }
  }
})

const bundlePackage = computed(() => isBundleSearchObject(props.data))

type MarketUser = ReturnType<typeof getUsers>[number]

interface AvatarView {
  key: string
  user: MarketUser
  label: string
  initial: string
  src: string
  candidates: ReturnType<typeof getUserAvatarCandidates>
  signature: string
  candidate?: ReturnType<typeof getUserAvatarCandidates>[number]
  cached: boolean
}

const avatarViews = computed<AvatarView[]>(() => {
  return getUsers(props.data).map((user, index) => {
    const candidates = getUserAvatarCandidates(user, props.gravatar)
    const key = getAvatarIdentity(user, candidates, index)
    const cached = avatars.value[key] || getCachedAvatarFromCandidates(candidates)
    const candidate = cached ? undefined : getAvatarSource(key, candidates)
    return {
      key,
      user,
      label: user.name || user.username || user.email || key,
      initial: getAvatarInitial(user),
      src: cached || candidate?.url || '',
      candidates,
      signature: getAvatarSignature(candidates),
      candidate,
      cached: !!cached,
    }
  })
})

function getAvatarIdentity(user: MarketUser, candidates: ReturnType<typeof getUserAvatarCandidates>, index: number) {
  return getUserKey(user) || candidates[0]?.cacheKey || `${props.data.package.name}:${index}`
}

function getAvatarSignature(candidates: ReturnType<typeof getUserAvatarCandidates>) {
  return candidates.map(candidate => `${candidate.cacheKey}\n${candidate.source}\n${candidate.url}`).join('\n---\n')
}

function getAvatarInitial(user: MarketUser) {
  return (user.name || user.username || user.email || '?').trim().slice(0, 1).toUpperCase() || '?'
}

function getAvatarSource(key: string, candidates: ReturnType<typeof getUserAvatarCandidates>) {
  if (!candidates.length) return
  const start = Math.max(0, avatarCursor.value[key] || 0)
  for (let index = start; index < candidates.length; index++) {
    const candidate = candidates[index]
    if (!isAvatarSourceFailed(candidate)) return candidate
  }
  return
}

function isAvatarSourceFailed(candidate: ReturnType<typeof getUserAvatarCandidates>[number]) {
  return isAvatarFailureCached(getAvatarSourceKey(candidate))
}

function getAvatarSourceKey(candidate: ReturnType<typeof getUserAvatarCandidates>[number]) {
  return `${candidate.cacheKey}:${candidate.url}`
}

function handleAvatarRenderError(view: AvatarView) {
  const candidate = view.candidate
  if (!candidate) return
  cacheAvatarFailure(getAvatarSourceKey(candidate))
  const currentIndex = Math.max(0, view.candidates.findIndex(item => item.url === candidate.url && item.cacheKey === candidate.cacheKey))
  avatarCursor.value = { ...avatarCursor.value, [view.key]: currentIndex + 1 }
  const cached = getCachedAvatarFromCandidates(view.candidates)
  if (cached) avatars.value = { ...avatars.value, [view.key]: cached }
}

function handleAvatarRenderLoad(view: AvatarView) {
  if (!view.candidate) return
  const taskKey = `${view.key}:${view.signature}:${view.candidate.url}`
  if (avatarTasks.has(taskKey)) return
  const task = fetchAndCacheAvatar(view.candidate.cacheKey, view.candidate.url, false)
    .finally(() => {
      avatarTasks.delete(taskKey)
    })
  avatarTasks.set(taskKey, task)
}

function hydrateCachedAvatars() {
  for (const view of avatarViews.value) {
    if (!view.candidates.length || view.cached) continue
    const first = view.candidates[0]
    const taskKey = `${view.key}:${view.signature}:cache`
    if (avatarTasks.has(taskKey)) continue
    const task = fetchCachedAvatar(first.cacheKey)
      .then((src) => {
        const current = avatarViews.value.some(item => {
          return item.key === view.key && item.signature === view.signature && !item.src
        })
        if (!current) return
        if (src) avatars.value = { ...avatars.value, [view.key]: src }
      })
      .finally(() => {
        avatarTasks.delete(taskKey)
      })
    avatarTasks.set(taskKey, task)
  }
}

function formatValue(value: number) {
  return value >= 100 ? +value.toFixed() : +value.toFixed(1)
}

function formatSize(value: number) {
  if (value >= (1 << 20) * 1000) {
    return formatValue(value / (1 << 30)) + ' GB'
  } else if (value >= (1 << 10) * 1000) {
    return formatValue(value / (1 << 20)) + ' MB'
  } else {
    return formatValue(value / (1 << 10)) + ' KB'
  }
}

const { t, setLocaleMessage } = useI18n({
  messages: {
    'zh-CN': zhCN,
  },
})

function timeAgo(time: string) {
  const now = new Date()
  const input = new Date(time)
  const diff = now.getTime() - input.getTime()
  if (diff < 86400000) return t('time.just-now')
  if (diff < 604800000) return t('time.days-ago', [Math.floor(diff / 86400000)])
  return input.toLocaleDateString()
}

function updatedAgo(time: string) {
  return t('time.updated-ago', [timeAgo(time)])
}

if (import.meta.hot) {
  import.meta.hot.accept('../locales/zh-CN.yml', (module) => {
    setLocaleMessage('zh-CN', module.default)
  })
}

watch(() => [props.data.package.name, props.gravatar], () => {
  avatarCursor.value = {}
  avatarTasks.clear()
  avatars.value = {}
})

watch(() => avatarViews.value.map(view => `${view.key}:${view.signature}:${view.src ? '1' : '0'}`), () => {
  hydrateCachedAvatars()
}, { immediate: true })

</script>

<style lang="scss" scoped>

.cursor-pointer {
  cursor: pointer;
}

.market-package {
  width: 100%;
  max-width: 540px;
  height: calc(12.5rem + 2px);
  margin: 0;
  padding: 1rem 1.25rem;
  box-sizing: border-box;
  position: relative;
  contain: layout paint style;
  contain-intrinsic-size: 12.5rem;
  border-radius: 12px;
  background-color: var(--k-color-card, var(--k-card-bg));
  border: 1px solid var(--k-color-border);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;

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

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
    border-color: var(--k-color-primary);
  }

  .market-icon {
    height: 1em;
    display: inline;
  }

  .header, .footer {
    flex: 0 0 auto;
  }

  .header {
    position: relative;

    .left {
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 10px;
      border: 1px solid transparent;
      box-sizing: border-box;
      transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;

      svg {
        height: 1.75rem;
      }

      background: linear-gradient(135deg,
        color-mix(in srgb, var(--c) 18%, var(--k-card-bg)),
        color-mix(in srgb, var(--c) 10%, var(--k-card-bg))
      );
      border-color: color-mix(in srgb, var(--c) 35%, var(--k-color-border));
      svg { color: var(--c); }
    }

    h2 {
      font-size: 1.125rem;
      margin: 0;
      line-height: 1.2;
      display: flex;
      align-items: center;
      min-width: 0;

      .title {
        flex: 0 1 auto;
        line-height: 1.5rem;
        display: inline-block;
        font-weight: 600;
        color: var(--k-text-dark, var(--k-text-normal));
      }

      .icon {
        margin-left: 0.5rem;
        padding: 0 6px;
        height: 20px;
        line-height: 20px;
        border-radius: 10px;
        font-size: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        background-color: var(--k-color-background);
        border: 1px solid transparent;

        .market-icon {
          height: 12px;
          transition: color 0.3s ease;
          z-index: 10;
        }

        &.verified, &.newborn {
          color: var(--k-color-success);
          background-color: rgba(64, 191, 122, 0.1);
          border-color: rgba(64, 191, 122, 0.2);
        }

        &.preview {
          color: var(--k-color-warning);
          background-color: rgba(230, 162, 60, 0.1);
          border-color: rgba(230, 162, 60, 0.2);
        }

        &.insecure {
          color: var(--k-color-danger);
          background-color: rgba(245, 108, 108, 0.1);
          border-color: rgba(245, 108, 108, 0.2);
        }

        &.bundle {
          color: var(--bundle-color, #8b5cf6);
          background: color-mix(in srgb, var(--bundle-color, #8b5cf6) 12%, transparent);
          border-color: color-mix(in srgb, var(--bundle-color, #8b5cf6) 28%, transparent);
        }
      }
    }

    .text-right {
      display: flex;
      align-items: flex-start;
      justify-content: flex-end;
      gap: 0.35rem;
      min-width: fit-content;
    }

    .updated-meta {
      height: 1.5rem;
      display: inline-flex;
      align-items: center;
      gap: 0 0.35rem;
      width: fit-content;
      margin-top: 4px;
      max-width: 100%;
      font-size: 12px;
      line-height: 1;
      color: var(--k-text-light, #888);
      white-space: nowrap;

      .market-icon {
        color: var(--c, var(--k-color-primary));
        height: 0.875rem;
        width: 0.875rem;
        transition: color 0.3s ease;
      }
    }
  }

  .desc {
    margin: 4px 0 0;
    font-size: 14px;
    flex: 1 1 auto;
    line-height: 1.6;
    color: var(--k-text-light, #666);
    overflow: hidden;
    word-break: break-word;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  .footer {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    height: 1.5rem;
    margin-bottom: -0.25rem;
    cursor: default;
    font-size: 13px;
    color: var(--k-text-light, #888);
    transition: color 0.3s ease;
    overflow: visible;

    > * {
      flex: 0 0 auto;
    }

    .spacer {
      flex: 0 2 0.5rem;
    }

    .long-spacer {
      flex: 1 1 auto;
    }

    .market-icon {
      height: 12px;
      width: 16px;
      margin-right: 6px;
      vertical-align: -1px;
    }

    .avatars {
      display: flex;
      gap: 0.25rem;
      align-items: center;
      min-height: 1.5rem;

      .avatar {
        cursor: pointer;
        position: relative;
        display: inline-grid;
        place-items: center;
        height: 1.5rem;
        width: 1.5rem;
        border-radius: 100%;
        overflow: hidden;
        flex: 0 0 auto;
        background:
          linear-gradient(135deg,
            color-mix(in srgb, var(--c, var(--k-color-primary)) 28%, var(--k-card-bg)),
            color-mix(in srgb, var(--c, var(--k-color-primary)) 12%, var(--k-card-bg))
          );
        border: 1px solid color-mix(in srgb, var(--c, var(--k-color-primary)) 24%, var(--k-color-border));
        color: color-mix(in srgb, var(--c, var(--k-color-primary)) 74%, var(--k-text-dark, currentColor));
        font-size: 0.68rem;
        font-weight: 700;
        line-height: 1;

        &::before {
          content: attr(data-initial);
        }

        &:not(.placeholder)::before {
          content: '';
        }
      }

      img {
        position: absolute;
        inset: 0;
        height: 100%;
        width: 100%;
        object-fit: cover;
        border-radius: inherit;
        vertical-align: middle;
      }
    }
  }
}

  // Plugin bundle: distinct visual treatment
.market-package.bundle-card {
  --bundle-color: #8b5cf6;
  border-color: color-mix(in srgb, var(--bundle-color) 32%, var(--k-color-border));
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--bundle-color) 86%, transparent), color-mix(in srgb, var(--bundle-color) 26%, transparent) 54%, transparent) top left / 100% 3px no-repeat,
    linear-gradient(135deg, color-mix(in srgb, var(--bundle-color) 10%, transparent) 0%, transparent 55%),
    var(--k-color-card, var(--k-card-bg));
  box-shadow: 0 2px 12px color-mix(in srgb, var(--bundle-color) 12%, transparent), 0 1px 3px rgba(0, 0, 0, 0.04);

  &:hover {
    border-color: var(--bundle-color);
    box-shadow:
      0 16px 32px color-mix(in srgb, var(--bundle-color) 22%, transparent),
      0 4px 12px rgba(0, 0, 0, 0.08),
      inset 0 1px 0 rgb(255 255 255 / 8%);
  }

  // accent stripes top-left to suggest a "wrapped package"
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 3px;
    background: linear-gradient(90deg, var(--bundle-color), color-mix(in srgb, var(--bundle-color) 50%, transparent) 60%, transparent);
    border-radius: 12px 12px 0 0;
    pointer-events: none;
  }

  .header .left {
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--bundle-color) 26%, var(--k-card-bg)),
      color-mix(in srgb, var(--bundle-color) 14%, var(--k-card-bg)));
    border-color: color-mix(in srgb, var(--bundle-color) 38%, var(--k-color-border));
    svg { color: var(--bundle-color); }
  }

  h2 .title {
    color: var(--bundle-color);
  }
}

.market-package.list-mode {
  max-width: 100%;
  height: auto;
  min-height: 4rem;
  align-items: center;
  padding: 0.6rem 1rem;
  contain-intrinsic-size: 4rem;

  .header {
    flex: 0 0 23rem;
    gap: 0.75rem;
    min-width: 0;
    align-items: center;

    .main {
      display: flex;
      flex: 1 1 auto;
      min-width: 0;
      justify-content: center;
    }

    h2 {
      min-width: 0;
      font-size: 0.95rem;

      .title {
        min-width: 0;
      }
    }

    .bottom {
      display: none;
    }

    .text-right {
      flex: 0 0 auto;
    }
  }

  &::before {
    height: 2px;
  }

  .desc {
    min-width: 0;
    flex: 1 1 auto;
    -webkit-line-clamp: 1;
    margin: 0;
    font-size: 0.8rem;
  }

  .footer {
    flex: 0 0 auto;
    height: auto;
    margin-bottom: 0;
    font-size: 12px;
    white-space: nowrap;
  }
}

</style>
