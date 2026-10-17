<script setup lang="ts" generic="T extends string">
import { RadioGroupItem, RadioGroupRoot } from "reka-ui";

const {
  options,
  value,
  size = "small",
  disabled = false,
} = defineProps<{
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  size?: "small" | "large";
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:value": [value: T] }>();

defineSlots<{ icon?: (props: { value: T }) => unknown }>();
</script>

<template>
  <RadioGroupRoot
    class="segmented-control"
    :model-value="value"
    :disabled
    orientation="horizontal"
    :data-size="size"
    :style="{ '--segment-count': options.length }"
    @update:model-value="(next) => emit('update:value', next as T)"
  >
    <RadioGroupItem
      v-for="option in options"
      :key="option.value"
      class="segment-button"
      :value="option.value"
    >
      <slot name="icon" :value="option.value" />
      {{ option.label }}
    </RadioGroupItem>
  </RadioGroupRoot>
</template>

<style scoped>
@layer components {
  .segmented-control {
    display: grid;
    grid-template-columns: repeat(var(--segment-count), minmax(0, 1fr));
    gap: 4px;
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
    padding: 4px;

    > .segment-button {
      display: inline-flex;
      block-size: 32px;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid transparent;
      border-radius: var(--radius-xs);
      font-size: var(--text-sm);
      font-weight: 500;
      color: var(--color-muted);
      transition-property: background-color, color;
      transition-duration: var(--duration-fast);
      transition-timing-function: var(--ease-out);

      &[aria-checked="true"] {
        border-color: var(--color-line);
        background: var(--color-surface);
        color: var(--color-ink);
        box-shadow: var(--shadow-raised);
      }
    }

    &[data-size="large"] > .segment-button {
      block-size: 44px;
      font-size: var(--text-base);
    }
  }
}
</style>
