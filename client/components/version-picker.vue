<template>
  <el-popover
    v-model:visible="open"
    trigger="click"
    placement="bottom-start"
    :width="240"
    :show-arrow="false"
    :offset="4"
    :disabled="disabled"
    :popper-class="`market-version-picker ${modeClass}`"
    @after-enter="list?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' })"
  >
    <template #reference>
      <button type="button" :disabled="disabled" :class="['version-trigger', { active: open, pending, danger: removing }]">
        <span v-if="removing">{{ t('dependencyCard.actions.remove') }}</span>
        <span v-else-if="!modelValue || placeholder && pending === false" class="placeholder">{{ placeholder }}</span>
        <span v-else>{{ modelValue }}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>
    </template>

    <!-- Packages can have hundreds of versions; keep the list short enough for a phone screen. -->
    <el-scrollbar max-height="min(16rem, 45vh)" always>
      <ul ref="list" class="version-options">
        <li
          v-for="(item, version) in versions"
          :key="version"
          :class="{ selected: version === modelValue }"
          @click="select(version)"
        >
          <span
            v-if="item.result"
            :class="['version-dot', item.result]"
            :title="item.result === 'danger' ? t('dependencyCard.picker.incompatible') : ''"
          ></span>
          <span class="version-text">{{ version }}</span>
          <span v-if="version === current" class="version-tag">{{ t('dependencyCard.picker.current') }}</span>
          <span v-else-if="version === latest" class="version-tag is-latest">{{ t('dependencyCard.picker.latest') }}</span>
          <span v-else-if="version.includes('-')" class="version-tag">{{ t('dependencyCard.picker.prerelease') }}</span>
          <svg v-if="version === modelValue" class="version-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m5 12 5 5 9-10"/>
          </svg>
        </li>
      </ul>
    </el-scrollbar>
    <button v-if="removable" type="button" :class="['version-remove', { selected: removing }]" @click="select(removeValue)">
      <k-icon name="market-next:trash"></k-icon>
      <span>{{ t('dependencyCard.actions.remove') }}</span>
    </button>
  </el-popover>
</template>

<script lang="ts" setup>

import { computed, ref } from 'vue'
import type { Dict } from '@koishijs/client'
import type { ResultType } from './utils'
import { useMarketNextI18n } from '../i18n'

const props = withDefaults(defineProps<{
  modelValue?: string
  versions: Dict<{ result?: ResultType }>
  current?: string
  latest?: string
  placeholder?: string
  removable?: boolean
  // Undefined means the caller doesn't track pending changes, so the value is always shown.
  pending?: boolean
  removeValue?: string
  disabled?: boolean
  modeClass?: string
}>(), { pending: undefined, removeValue: '' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useMarketNextI18n()
const open = ref(false)
// An empty remove value (used by the install dialog) also means "nothing picked", which shows the placeholder instead.
const removing = computed(() => !!props.removeValue && props.modelValue === props.removeValue)
const list = ref<HTMLElement>()

function select(value: string) {
  open.value = false
  emit('update:modelValue', value)
}

</script>

<style lang="scss" scoped>

.version-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  height: 1.5rem;
  max-width: 100%;
  border: 1px solid var(--k-color-border);
  border-radius: 4px;
  padding: 0 0.375rem 0 0.5rem;
  color: var(--fg1);
  background: transparent;
  font: inherit;
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.25rem;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  svg {
    flex: 0 0 auto;
    width: 0.875rem;
    height: 0.875rem;
    color: var(--fg3);
    transition: transform 0.2s ease;
  }

  &:hover,
  &.active {
    border-color: var(--k-color-primary);
  }

  &.active svg {
    transform: rotate(180deg);
  }

  &.pending {
    color: var(--k-color-primary);
    font-weight: 600;
  }

  &.danger {
    color: var(--danger);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
    border-color: var(--k-color-border);
  }

  .placeholder {
    color: var(--fg3);
  }
}

</style>

<style lang="scss">

.market-version-picker.el-popover.el-popper {
  padding: 0.25rem;
  border-color: var(--k-color-border);
  border-radius: 6px;
  background: var(--k-card-bg);
  box-shadow: 0 6px 16px rgb(0 0 0 / 12%);

  .version-options {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li,
  .version-remove {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    height: 2rem;
    box-sizing: border-box;
    border: 0;
    border-radius: 4px;
    padding: 0 0.5rem;
    color: var(--fg1);
    background: transparent;
    font: inherit;
    font-size: 0.875rem;
    // <button> defaults to line-height: normal, which puts its text higher than the <li> rows.
    line-height: 1.25rem;
    cursor: pointer;

    &:hover {
      background: var(--k-hover-bg);
    }

    &.selected {
      color: var(--k-color-primary);
      background: color-mix(in srgb, var(--k-color-primary) 10%, transparent);
    }
  }

  .version-dot {
    flex: 0 0 auto;
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    background: var(--k-color-success);

    &.warning { background: var(--warning); }
    &.danger { background: var(--danger); }
  }

  .version-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .version-tag {
    flex: 0 0 auto;
    border-radius: 4px;
    padding: 0 0.375rem;
    color: var(--fg3);
    background: var(--k-side-bg);
    font-size: 0.75rem;
    line-height: 1.25rem;

    &.is-latest {
      color: var(--k-color-success);
      background: color-mix(in srgb, var(--k-color-success) 12%, transparent);
    }
  }

  .version-check {
    flex: 0 0 auto;
    width: 0.875rem;
    height: 0.875rem;
    margin-left: auto;
  }

  // The divider sits in the gap above the row, so the row keeps the same spacing on both sides
  // and its content is centered between the divider and the popover edge.
  .version-remove {
    position: relative;
    margin-top: calc(0.5rem + 1px);
    color: var(--danger);

    &::before {
      content: '';
      position: absolute;
      top: calc(-0.25rem - 1px);
      left: 0;
      right: 0;
      border-top: 1px solid var(--k-color-divider);
    }

    .k-icon {
      width: 1rem;
      height: 1rem;
    }

    &:hover,
    &.selected {
      color: var(--danger);
      background: color-mix(in srgb, var(--danger) 10%, transparent);
    }
  }
}

</style>
