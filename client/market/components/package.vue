<template>
  <a :class="['market-package flex gap-3', config.layout === 'list' ? 'list-mode flex-row' : 'flex-col']" target="_blank" :href="homepage">
    <div class="header flex flex-row gap-4">
      <div :class="['left', 'shrink-0', 'flex', 'flex-row', 'justify-center', 'items-center', 'cat-' + resolveCategory(data.category)]">
        <market-icon :name="'outline:' + resolveCategory(data.category)"></market-icon>
      </div>
      <div class="main flex flex-col justify-around overflow-hidden">
        <h2 class="top">
          <span class="title truncate" :title="data.shortname">{{ data.shortname }}</span>
          <el-tooltip v-if="badge" placement="right" :content="t(`badge.${badge.type}`)">
            <span :class="['icon', badge.type]" @click.stop.prevent="$emit('query', badge.query)">
              <market-icon :name="badge.type"></market-icon>
            </span>
          </el-tooltip>
        </h2>
        <div class="bottom">
          <el-tooltip :content="Math.max(Math.min(data.rating ?? 0, 5), 0).toFixed(1)" placement="right">
            <div class="rating">
              <market-icon v-for="index in starIndexes" :key="index" :name="index + 0.5 < data.rating ? 'star-full' : 'star-empty'"></market-icon>
            </div>
          </el-tooltip>
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
        <el-tooltip v-for="user in getUsers(data)" :key="user.email || user.username || user.name" :content="user.name || user.username || user.email" placement="top">
          <span class="avatar" @click.stop.prevent="user.email && $emit('query', 'email:' + user.email)">
            <img :src="getAvatar(user)" loading="lazy" decoding="async">
          </span>
        </el-tooltip>
      </div>
    </div>
  </a>
</template>

<script lang="ts" setup>

import { computed, inject } from 'vue'
import { SearchObject } from '@koishijs/registry'
import { useI18nText } from '@koishijs/components'
import { badges, getUserAvatar, getUsers, resolveCategory, validate } from '../utils'
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

const tt = useI18nText()
const starIndexes = [0, 1, 2, 3, 4]

const homepage = computed(() => {
  const { homepage, repository } = props.data.package.links
  if (homepage) return homepage
  if (repository) return repository.replace(/^git\+/, '').replace(/\.git$/, '')
})

const badge = computed(() => {
  for (const type in badges) {
    if (badges[type].hidden?.(config, 'card')) continue
    if (validate(props.data, badges[type].query)) return { type, ...badges[type] }
  }
})

function getAvatar(user: ReturnType<typeof getUsers>[number]) {
  return getUserAvatar(user, props.gravatar)
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
  if (diff < 30000) return t('time.just-now')
  if (diff < 3600000) return t('time.minutes-ago', [Math.floor(diff / 60000)])
  if (diff < 86400000) return t('time.hours-ago', [Math.floor(diff / 3600000)])
  if (diff < 604800000) return t('time.days-ago', [Math.floor(diff / 86400000)])
  return input.toLocaleDateString()
}

if (import.meta.hot) {
  import.meta.hot.accept('../locales/zh-CN.yml', (module) => {
    setLocaleMessage('zh-CN', module.default)
  })
}

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
  content-visibility: auto;
  contain-intrinsic-size: 12.5rem;
  border-radius: 12px;
  background-color: var(--k-color-card, var(--k-card-bg));
  border: 1px solid var(--k-color-border);
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.06);
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

      // category theme colors — use color-mix so dark theme gets muted versions automatically
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
      }
    }

    .rating {
      height: 1.5rem;
      display: inline-flex;
      align-items: center;
      gap: 0 0.25rem;
      width: fit-content;
      margin-top: 4px;

      .market-icon {
        color: var(--k-color-warning);
        height: 0.875rem;
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
    overflow: hidden;

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

      .avatar {
        cursor: pointer;
      }

      img {
        height: 1.5rem;
        width: 1.5rem;
        border-radius: 100%;
        vertical-align: middle;
      }
    }
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
    flex: 0 0 auto;
    gap: 0.75rem;

    .main {
      display: none;
    }
  }

  .desc {
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
