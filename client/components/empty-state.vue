<template>
  <div class="market-empty">
    <span class="market-empty-icon" aria-hidden="true">
      <k-icon :name="icon"></k-icon>
    </span>
    <strong>{{ title }}</strong>
    <p v-if="description">{{ description }}</p>
    <slot></slot>
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  icon: string
  title: string
  description?: string
}>()
</script>

<style lang="scss">
.market-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2.5rem 1.5rem;
  text-align: center;

  strong {
    color: var(--fg1);
    font-size: 1rem;
    font-weight: 600;
  }

  p {
    max-width: 26rem;
    margin: 0;
    color: var(--fg3);
    font-size: 0.875rem;
    line-height: 1.6;
  }
}

.market-empty-icon {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  margin-bottom: 0.25rem;
  border-radius: 50%;
  color: var(--fg3);
  background: var(--k-side-bg);

  .k-icon {
    width: 1.75rem;
    height: 1.75rem;
  }
}
</style>
