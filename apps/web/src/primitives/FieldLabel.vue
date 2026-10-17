<script setup lang="ts">
const { as = "span" } = defineProps<{ as?: "span" | "p" | "legend" }>();
</script>

<template>
  <component :is="as" class="field-label"><slot /></component>
</template>

<style scoped>
@layer components {
  .field-label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-ink-2);
  }
}
</style>
