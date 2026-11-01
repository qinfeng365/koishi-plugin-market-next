<template>
  <market-view class="market-ui-ve"></market-view>
</template>

<script lang="ts" setup>
import MarketView from '../../components/market.vue'
</script>

<style lang="scss">
.market-ui-ve {
  .market-package {
    padding: 1rem 1.25rem;
    gap: 0.625rem;
    border-radius: 10px;
    transition: border-color 120ms var(--k-transition, ease), transform 120ms var(--k-transition, ease);

    &:hover {
      transform: translateY(-1px);
    }

    .header {
      .main {
        flex: 1 1 auto;
        min-width: 0;
      }

      > .text-right {
        flex-grow: 0;
      }

      .left {
        width: 3.5rem;
        height: 3.5rem;
        border-radius: 8px;

        svg {
          height: 1.75rem;
        }
      }

      h2 {
        font-size: 1rem;
        align-items: flex-start;
        min-height: 2.6rem;

        .title.truncate {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          white-space: normal;
          overflow: hidden;
          overflow-wrap: anywhere;
          line-height: 1.3rem;
        }
      }
    }

    .desc {
      flex: 0 0 auto;
      height: 3.2em;
      -webkit-line-clamp: 2;
    }
  }

  .market-date-filter {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
  }

  .market-date-row {
    display: grid;
    grid-template-columns: minmax(4.5rem, max-content) minmax(0, 1fr);
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .market-package {
      transition: none;
    }

    .market-package:hover {
      transform: none;
    }
  }

  @media (max-width: 420px) {
    .market-package {
      padding: 0.82rem 0.9rem;

      .header .left {
        width: 3rem;
        height: 3rem;
      }
    }
  }
}
</style>
