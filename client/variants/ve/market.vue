<template>
  <market-view class="market-ui-ve"></market-view>
</template>

<script lang="ts" setup>
import MarketView from '../../components/market.vue'
</script>

<style lang="scss">
.market-ui-ve {
  .market-package {
    min-height: 12.5rem;
    padding: 1rem 1.25rem;
    gap: 0.75rem;
    border-radius: 8px;

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
      }
    }

    .desc {
      flex: 1 1 auto;
      height: 4.8em;
      -webkit-line-clamp: 3;
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

  @media (max-width: 420px) {
    .market-package {
      min-height: 11rem;
      padding: 0.82rem 0.9rem;

      .header .left {
        width: 3rem;
        height: 3rem;
      }
    }
  }
}
</style>
