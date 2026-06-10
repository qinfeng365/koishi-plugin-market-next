<template>
  <div class="search-box">
    <div class="search-container">
      <span
        v-for="(word, index) in modelValue.slice(0, -1)"
        :key="index" class="search-word"
        :class="{ invalid: !validateWord(word) }"
        @click="onClickWord(index)"
      >{{ word }}</span>
      <input
        :placeholder="t('search.placeholder')"
        v-model="lastWord"
        ref="input"
        @blur="onEnter"
        @keydown.escape="onEscape"
        @keydown.backspace="onBackspace"
        @keypress.enter.prevent="onEnter"
        @keypress.space.prevent="onEnter"/>
    </div>
    <div class="search-action" @click.stop="onClear">
      <market-icon class="search" name="search"></market-icon>
      <market-icon class="close" name="close"></market-icon>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { computed, ref, watch } from 'vue'
import { validateWord } from '../utils'
import { useI18n } from 'vue-i18n'
import { useDebounceFn } from '@vueuse/core'
import zhCN from '../locales/zh-CN.yml'
import MarketIcon from '../icons'

const props = defineProps<{
  modelValue: string[]
  placeholder?: string
}>()

const emit = defineEmits(['update:modelValue'])

const input = ref<HTMLInputElement>()
const words = ref<string[]>()

watch(() => props.modelValue, (value) => {
  words.value = value.slice()
}, { immediate: true, deep: true })

const update = useDebounceFn(() => {
  emit('update:modelValue', words.value)
}, 120, { maxWait: 500 })

const lastWord = computed({
  get: () => words.value[words.value.length - 1],
  set: (value) => {
    words.value[words.value.length - 1] = value.toLowerCase()
    update()
  },
})

function onClickWord(index: number) {
  words.value.splice(index, 1)
  emit('update:modelValue', words.value)
  input.value?.focus()
}

function onEnter() {
  const last = words.value[words.value.length - 1]
  if (!last) return
  if (words.value.slice(0, -1).includes(last)) {
    words.value.pop()
  }
  words.value.push('')
  emit('update:modelValue', words.value)
}

function onEscape(event: KeyboardEvent) {
  words.value[words.value.length - 1] = ''
  emit('update:modelValue', words.value)
}

function onBackspace(event: KeyboardEvent) {
  if (words.value[words.value.length - 1] === '' && words.value.length > 1) {
    event.preventDefault()
    words.value.splice(words.value.length - 2, 1)
    emit('update:modelValue', words.value)
  }
}

function onClear() {
  words.value = ['']
  emit('update:modelValue', words.value)
}

function focus() {
  input.value?.focus()
}

defineExpose({ focus })

const { t, setLocaleMessage } = useI18n({
  messages: {
    'zh-CN': zhCN,
  },
})

if (import.meta.hot) {
  import.meta.hot.accept('../locales/zh-CN.yml', (module) => {
    setLocaleMessage('zh-CN', module.default)
  })
}

</script>

<style lang="scss" scoped>

.search-box {
  display: flex;
  margin: 2rem auto 0;
  width: 100%;
  max-width: 640px;
  border-radius: 2rem;
  align-items: center;
  border: 1.5px solid var(--k-color-border);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:focus-within {
    border-color: var(--k-color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--k-color-primary) 15%, transparent);
  }
}

.search-container {
  flex: 1 1 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 6px;
  padding: 0.75rem 1.25rem;
  padding-right: 0;

  input {
    flex: 1 1 auto;
    height: 1.25rem;
    min-width: 10rem;
    font-size: 0.925rem;
    padding: 0;
    box-sizing: border-box;
    color: inherit;
    background-color: transparent;
    border: none;
    outline: none;

    &::placeholder {
      color: var(--el-text-color-placeholder);
    }
  }
}

.search-action {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 2.5rem;
  cursor: pointer;
  opacity: 0.45;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.85;
  }

  :deep(.market-icon) {
    display: block;
    width: 1rem;
    height: 1rem;
    max-width: 1rem;
    max-height: 1rem;
    flex: 0 0 auto;
  }

  &:hover :deep(.market-icon.search) {
    display: none;
  }

  &:not(:hover) :deep(.market-icon.close) {
    display: none;
  }
}

.search-word {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  height: 1.375rem;
  border-radius: 6px;
  padding: 0 8px;
  box-sizing: border-box;
  color: var(--k-color-primary);
  font-weight: 500;
  white-space: nowrap;
  background-color: color-mix(in srgb, var(--k-color-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--k-color-primary) 25%, transparent);
  cursor: pointer;
  user-select: none;
  transition: opacity 0.2s ease, background-color 0.2s ease;

  &.invalid {
    opacity: 0.5;
    text-decoration: line-through;
  }

  &.invalid:hover {
    opacity: 1;
  }
}

</style>
