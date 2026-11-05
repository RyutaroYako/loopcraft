<script setup lang="ts">
import type { Polarity } from "@loopcraft/core/schema";

const { polarity } = defineProps<{ polarity: Polarity }>();
</script>

<template>
  <span class="polarity-glyph" :data-polarity="polarity === '+' ? 'positive' : 'negative'">
    {{ polarity === "+" ? "+" : "−" }}
  </span>
</template>

<style scoped>
@layer components {
  .polarity-glyph {
    display: inline-grid;
    block-size: 18px;
    inline-size: 18px;
    flex: none;
    place-items: center;
    border-radius: var(--radius-xs);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 600;

    &[data-polarity="positive"] {
      background: var(--color-surface-2);
      color: var(--color-ink);
    }

    &[data-polarity="negative"] {
      background: var(--color-negative-soft);
      color: var(--color-negative);
    }
  }
}
</style>
