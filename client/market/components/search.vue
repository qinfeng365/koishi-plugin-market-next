<template>
  <div class="search-box">
    <div class="search-container">
      <span
        v-for="(word, index) in displayWords"
        :key="index" class="search-word"
        :class="{ invalid: !validateWord(word) }"
        @click="onClickWord(index)"
      >{{ word }}</span>
      <input
        :placeholder="t('search.placeholder')"
        v-model="lastWord"
        ref="input"
        @blur="onBlur"
        @keydown.escape="onEscape"
        @keydown.backspace="onBackspace"
        @keydown.enter.prevent="commitInput"
        @keydown.space.prevent="commitInput"/>
    </div>
    <div class="search-action" @click.stop="onClear">
      <market-icon class="search" name="search"></market-icon>
      <market-icon class="close" name="close"></market-icon>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { computed, ref, watch } from 'vue'
import { useMarketI18n, validateWord } from '../utils'
import { useDebounceFn } from '@vueuse/core'
import MarketIcon from '../icons'

const props = defineProps<{
  modelValue: string[]
  placeholder?: string
}>()

const emit = defineEmits(['update:modelValue'])

const input = ref<HTMLInputElement>()
const words = ref<string[]>([''])
const draft = ref('')

watch(() => props.modelValue, (value) => {
  const current = normalizeWords([...getCommittedWords(), draft.value])
  if (draft.value && document.activeElement === input.value && sameWords(value, current)) return
  const next = normalizeWords(value)
  words.value = next
  draft.value = next[next.length - 1] || ''
}, { immediate: true, deep: true })

const update = useDebounceFn(() => {
  emit('update:modelValue', normalizeWords([...getCommittedWords(), draft.value]))
}, 120, { maxWait: 500 })

const committedWords = computed(() => getCommittedWords())
const displayWords = computed(() => committedWords.value)

const lastWord = computed({
  get: () => draft.value,
  set: (value) => {
    draft.value = value.toLowerCase()
    update()
  },
})

function onClickWord(index: number) {
  const tokens = committedWords.value.slice()
  tokens.splice(index, 1)
  words.value = normalizeWords([...tokens, draft.value])
  emit('update:modelValue', words.value)
  input.value?.focus()
}

function commitInput() {
  const last = draft.value.trim().toLowerCase()
  if (!last) return
  const tokens = committedWords.value.slice()
  if (!tokens.includes(last)) {
    tokens.push(last)
  }
  draft.value = ''
  words.value = normalizeWords(tokens)
  emit('update:modelValue', words.value)
}

function onBlur() {
  draft.value = draft.value.trim().toLowerCase()
}

function onEscape() {
  draft.value = ''
  words.value = normalizeWords(committedWords.value)
  emit('update:modelValue', words.value)
}

function onBackspace(event: KeyboardEvent) {
  if (draft.value === '' && committedWords.value.length) {
    event.preventDefault()
    const tokens = committedWords.value.slice(0, -1)
    words.value = normalizeWords(tokens)
    emit('update:modelValue', words.value)
  }
}

function onClear() {
  draft.value = ''
  words.value = ['']
  emit('update:modelValue', words.value)
}

function focus() {
  input.value?.focus()
}

function normalizeWords(value: string[]) {
  const tokens = value.filter(Boolean)
  return tokens.length ? [...tokens, ''] : ['']
}

function getCommittedWords() {
  return words.value.slice(0, -1).filter(Boolean)
}

function sameWords(a: string[], b: string[]) {
  const left = normalizeWords(a)
  const right = normalizeWords(b)
  return left.length === right.length && left.every((word, index) => word === right[index])
}

defineExpose({ focus })

const { t } = useMarketI18n()

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

@media (max-width: 420px) {
  .search-box {
    border-radius: 12px;
  }

  .search-container {
    padding: 0.62rem 0.75rem;
    padding-right: 0;

    input {
      min-width: 5.5rem;
    }
  }

  .search-action {
    width: 2.55rem;
  }
}

</style>
