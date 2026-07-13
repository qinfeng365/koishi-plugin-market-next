<template>
  <section :class="['market-secret-archive', { 'is-ready': ready, 'is-copy-ready': copyReady }]">
    <header class="market-secret-archive__header">
      <code>{{ t('marketPage.easter.archive.path') }}</code>
      <span>{{ ready ? t('marketPage.easter.archive.recovered') : t('marketPage.easter.archive.recovering') }}</span>
    </header>

    <div class="market-secret-archive__visual">
      <koishi-eye-splash
        class="market-secret-archive__animation"
        @ready="ready = true"
        @complete="copyReady = true"
      ></koishi-eye-splash>
    </div>

    <div class="market-secret-archive__record">
      <dl class="market-secret-archive__meta archive-meta-reveal" style="animation-delay: 0.15s">
        <div>
          <dt>{{ t('marketPage.easter.archive.koishiVersion') }}</dt>
          <dd>{{ koishiVersion || t('marketPage.easter.archive.unknown') }}</dd>
        </div>
        <div>
          <dt>{{ t('marketPage.easter.archive.recordedAt') }}</dt>
          <dd>{{ recordedAt }}</dd>
        </div>
        <div>
          <dt>{{ t('marketPage.easter.archive.marketIndex') }}</dt>
          <dd>{{ t('marketPage.easter.archive.plugins', { count: formattedMarketCount }) }}</dd>
        </div>
      </dl>

      <article class="market-secret-archive__copy">
        <k-markdown
          v-for="(paragraph, index) in paragraphs"
          :key="index"
          class="market-secret-archive__paragraph archive-copy-reveal"
          :style="{ animationDelay: `${0.2 + index * 0.24}s` }"
          :source="paragraph"
        ></k-markdown>
      </article>

      <div
        class="market-secret-archive__source archive-copy-reveal"
        :style="{ animationDelay: `${0.3 + paragraphs.length * 0.24}s` }"
      >
        <span>{{ t('marketPage.easter.archive.sourceLabel') }}</span>
        <code>{{ t('marketPage.easter.archive.source') }}</code>
      </div>

      <p
        class="market-secret-archive__declaration archive-copy-reveal"
        :style="{ animationDelay: `${0.57 + paragraphs.length * 0.24}s` }"
      >
        {{ declaration }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMarketNextI18n } from '../i18n'
import KoishiEyeSplash from './koishi-eye-splash.vue'

const props = defineProps<{
  koishiVersion?: string,
  marketCount: number,
  recordedAt: string,
}>()

const { t, locale } = useMarketNextI18n()
const ready = ref(false)
const copyReady = ref(false)

const blocks = computed(() => t('marketPage.easter.secretSearch')
  .split(/\r?\n\s*\r?\n/)
  .map(block => block.trim())
  .filter(Boolean))

const paragraphs = computed(() => blocks.value.slice(0, -1))

const declaration = computed(() => {
  const value = blocks.value.at(-1) || ''
  return value.replace(/^\*\*(.*)\*\*$/s, '$1')
})

const formattedMarketCount = computed(() => props.marketCount.toLocaleString(locale.value))
</script>

<style lang="scss">
.market-secret-archive {
  width: 100%;
  max-width: 58rem;
  min-height: 70vh;
  box-sizing: border-box;
  margin: 0 auto;
  padding: clamp(1.5rem, 4vw, 3rem) clamp(0.25rem, 3vw, 2rem) clamp(4rem, 8vw, 7rem);
  color: var(--el-text-color-regular);
  animation: market-secret-archive-enter 0.28s ease-out both;
}

.market-secret-archive__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 2rem;
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 12px;

  code {
    color: color-mix(in srgb, var(--k-color-primary) 72%, var(--el-text-color-primary));
  }
}

.market-secret-archive__visual {
  position: relative;
  width: min(38rem, 100%);
  height: clamp(18rem, 48vw, 34rem);
  margin: 0 auto;
  overflow: hidden;
}

.market-secret-archive__animation {
  position: absolute;
  inset: -5%;
  opacity: 0.82;
}

.market-secret-archive__record {
  width: min(48rem, 100%);
  margin: -1rem auto 0;
}

.archive-meta-reveal,
.archive-copy-reveal {
  opacity: 0;
  transform: translateY(14px);
}

.market-secret-archive.is-ready .archive-meta-reveal,
.market-secret-archive.is-copy-ready .archive-copy-reveal {
  animation: market-secret-archive-reveal 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.market-secret-archive__meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin: 0 0 clamp(2rem, 5vw, 3.5rem);
  padding: 0.85rem 0;
  border-top: 1px solid var(--k-color-border);
  border-bottom: 1px solid var(--k-color-border);

  > div {
    min-width: 0;
  }

  dt {
    margin-bottom: 0.25rem;
    color: var(--el-text-color-secondary);
    font-size: 11px;
  }

  dd {
    overflow-wrap: anywhere;
    margin: 0;
    color: var(--el-text-color-primary);
    font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, Consolas, monospace);
    font-size: 12px;
  }
}

.market-secret-archive__copy {
  font-size: 15px;
  line-height: 1.95;
}

.market-secret-archive__paragraph {
  margin-bottom: 1.25rem;

  p {
    margin: 0;
  }
}

.market-secret-archive__source {
  margin: clamp(2.25rem, 6vw, 4rem) 0 1.5rem;
  padding: 0.9rem 0;
  border-top: 1px solid var(--k-color-border);
  border-bottom: 1px solid var(--k-color-border);

  span {
    display: block;
    margin-bottom: 0.45rem;
    color: var(--el-text-color-secondary);
    font-size: 11px;
  }

  code {
    display: block;
    color: color-mix(in srgb, var(--k-color-primary) 80%, var(--el-text-color-primary));
    font-family: var(--el-font-family-monospace, ui-monospace, SFMono-Regular, Consolas, monospace);
    font-size: clamp(12px, 2vw, 14px);
    line-height: 1.7;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
}

.market-secret-archive__declaration {
  margin: 0;
  color: color-mix(in srgb, var(--k-color-primary) 82%, var(--el-text-color-primary));
  font-size: clamp(1.2rem, 3.5vw, 1.75rem);
  font-weight: 700;
  line-height: 1.5;
  text-align: center;
  text-shadow: 0 0 18px color-mix(in srgb, var(--k-color-primary) 30%, transparent);
}

@keyframes market-secret-archive-enter {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes market-secret-archive-reveal {
  from {
    opacity: 0;
    transform: translateY(14px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 600px) {
  .market-secret-archive__header {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.25rem;
  }

  .market-secret-archive__visual {
    height: min(86vw, 26rem);
  }

  .market-secret-archive__record {
    margin-top: 0;
  }

  .market-secret-archive__meta {
    grid-template-columns: 1fr;
    gap: 0.65rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .market-secret-archive {
    animation: none;
  }

  .market-secret-archive.is-ready .archive-meta-reveal,
  .market-secret-archive.is-copy-ready .archive-copy-reveal {
    opacity: 1;
    transform: none;
    animation: none;
  }
}
</style>
