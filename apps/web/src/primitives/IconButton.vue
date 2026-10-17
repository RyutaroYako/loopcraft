<script setup lang="ts">
import { useTemplateRef } from "vue";

const button = useTemplateRef<HTMLButtonElement>("button");

defineExpose({ element: button });
</script>

<template>
  <button ref="button" type="button" class="icon-button">
    <slot />
  </button>
</template>

<style scoped>
@layer components {
  .icon-button {
    display: inline-grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border-radius: var(--radius-sm);
    color: var(--color-ink-2);
    transition:
      background-color var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);

    &:hover:not(:disabled) {
      background: var(--color-surface-2);
      color: var(--color-ink);
    }

    &:active:not(:disabled) {
      transform: translateY(1px) scale(0.98);
    }

    &:disabled {
      opacity: 0.32;
      cursor: default;
    }
  }
}
</style>
