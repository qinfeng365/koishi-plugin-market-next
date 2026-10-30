<template>
  <div class="dialog-caption">{{ t('bundle.diff.title') }}</div>
  <div class="dialog-list">
    <div v-for="row in rows.filter(row => row.items.length)" :key="row.label" class="dialog-list-row diff-row">
      <div class="diff-label">
        {{ row.label }}
        <span class="dialog-count">{{ row.items.length }}</span>
      </div>
      <div class="diff-items">
        <!-- A manifest may list the same name twice, so the index is the key. -->
        <span v-for="(item, index) in row.items" :key="index" :class="['dialog-tag', { primary: item.preset }]">
          {{ item.name }}<template v-if="item.preset"> · {{ t('bundle.diff.preset') }}</template>
        </span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>

import { useMarketNextI18n } from '../i18n'

defineProps<{
  rows: { label: string, items: { name: string, preset?: boolean }[] }[]
}>()

const { t } = useMarketNextI18n()

</script>

<style lang="scss" scoped>

// Two classes, so the padding wins over the shared .dialog-list-row style.
.dialog-list-row.diff-row {
  display: grid;
  grid-template-columns: 7rem minmax(0, 1fr);
  align-items: baseline;
  gap: 0.375rem 0.75rem;
  padding-block: 0.625rem;
}

.diff-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--fg2);
}

.diff-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  min-width: 0;

  .dialog-tag {
    white-space: normal;
    overflow-wrap: anywhere;
  }
}

@media (max-width: 768px) {
  .dialog-list-row.diff-row {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
}

</style>
