<script setup lang="ts">
const {
  variant = "default",
  size = "default",
  tone = "default",
  type = "button",
} = defineProps<{
  variant?: "default" | "primary" | "ghost";
  size?: "default" | "small";
  tone?: "default" | "danger";
  type?: "button" | "submit";
}>();
</script>

<template>
  <button :type class="base-button" :data-variant="variant" :data-size="size" :data-tone="tone">
    <slot />
  </button>
</template>

<style scoped>
@layer components {
  .base-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    block-size: 34px;
    padding-inline: 12px;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    font-size: var(--text-base);
    font-weight: 500;
    white-space: nowrap;
    transition:
      background-color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);

    &:hover:not(:disabled) {
      border-color: var(--color-line-strong);
      background: var(--color-surface-2);
    }

    &:active:not(:disabled) {
      transform: translateY(1px) scale(0.98);
    }

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }

    &[data-variant="primary"] {
      border-color: var(--color-ink);
      background: var(--color-ink);
      color: var(--color-on-ink);

      &:hover:not(:disabled) {
        border-color: var(--color-ink-hover);
        background: var(--color-ink-hover);
      }
    }

    &[data-variant="ghost"] {
      border-color: transparent;
      background: transparent;

      &:hover:not(:disabled) {
        border-color: transparent;
        background: var(--color-surface-2);
      }
    }

    &[data-size="small"] {
      block-size: 28px;
      padding-inline: 10px;
      font-size: var(--text-sm);
    }

    &[data-tone="danger"] {
      color: var(--color-negative);
    }
  }
}
</style>
