<script setup lang="ts">
import { computed } from "vue";

const MAX_ITEMS = 8;

const { items } = defineProps<{ items: readonly string[] }>();

const shown = computed(() => items.slice(0, MAX_ITEMS));
const hidden = computed(() => items.length - shown.value.length);
</script>

<template>
  <ul class="detail-list">
    <li v-for="(item, index) in shown" :key="`${index}:${item}`">{{ item }}</li>
  </ul>
  <p v-if="hidden > 0" class="more-text">ほか {{ hidden }} 件</p>
</template>

<style scoped>
@layer components {
  .detail-list {
    display: grid;
    gap: 2px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    overflow-wrap: anywhere;
    color: var(--color-ink-2);
  }

  .more-text {
    font-size: var(--text-sm);
    color: var(--color-muted);
  }
}
</style>
