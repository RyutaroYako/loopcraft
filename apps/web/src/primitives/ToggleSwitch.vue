<script setup lang="ts">
import { useId } from "vue";
import { SwitchRoot, SwitchThumb } from "reka-ui";

const {
  label,
  checked,
  name,
  hint,
  disabled = false,
} = defineProps<{
  label: string;
  checked: boolean;
  name?: string;
  hint?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:checked": [checked: boolean] }>();

const id = useId();
</script>

<template>
  <label class="toggle-switch" :for="id">
    <SwitchRoot
      :id
      class="switch-track"
      :name
      :model-value="checked"
      :disabled
      @update:model-value="(next) => emit('update:checked', next)"
    >
      <SwitchThumb class="switch-thumb" />
    </SwitchRoot>
    <span class="label-area">
      <span class="label-text">{{ label }}</span>
      <span v-if="hint" class="hint-text">{{ hint }}</span>
    </span>
  </label>
</template>

<style scoped>
@layer components {
  .toggle-switch {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: start;
    gap: 12px;
    cursor: pointer;

    > .switch-track {
      position: relative;
      margin-block-start: 1px;
      block-size: 18px;
      inline-size: 32px;
      border-radius: var(--radius-full);
      background: var(--color-line-strong);
      transition: background-color 250ms var(--ease-out);

      &[data-state="checked"] {
        background: var(--color-accent);
      }

      &:focus-visible {
        outline: 1.5px solid var(--color-accent);
        outline-offset: 2px;
      }

      > .switch-thumb {
        position: absolute;
        inset-block-start: 2px;
        inset-inline-start: 2px;
        block-size: 14px;
        inline-size: 14px;
        border-radius: var(--radius-full);
        background: var(--color-surface);
        box-shadow: var(--shadow-knob);
        transition: transform 250ms var(--ease-out);

        &[data-state="checked"] {
          transform: translateX(14px);
        }
      }
    }

    > .label-area {
      > .label-text {
        display: block;
        font-size: var(--text-base);
        font-weight: 500;
      }

      > .hint-text {
        display: block;
        font-size: var(--text-sm);
        color: var(--color-muted);
      }
    }
  }
}
</style>
