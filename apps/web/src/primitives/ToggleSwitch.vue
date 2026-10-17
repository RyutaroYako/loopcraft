<script setup lang="ts">
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

function onChange(event: Event) {
  emit("update:checked", (event.currentTarget as HTMLInputElement).checked);
}
</script>

<template>
  <label class="toggle-switch">
    <input
      class="switch-input"
      role="switch"
      :name
      type="checkbox"
      :checked
      :disabled
      @change="onChange"
    />
    <span class="switch-track" aria-hidden="true" />
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

    > .switch-input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    > .switch-track {
      position: relative;
      margin-block-start: 1px;
      block-size: 18px;
      inline-size: 32px;
      border-radius: var(--radius-full);
      background: var(--color-line-strong);
      transition: background-color 250ms var(--ease-out);

      &::after {
        position: absolute;
        inset-block-start: 2px;
        inset-inline-start: 2px;
        block-size: 14px;
        inline-size: 14px;
        border-radius: var(--radius-full);
        background: var(--color-surface);
        box-shadow: var(--shadow-knob);
        content: "";
        transition: transform 250ms var(--ease-out);
      }
    }

    > .switch-input:checked + .switch-track {
      background: var(--color-accent);

      &::after {
        transform: translateX(14px);
      }
    }

    > .switch-input:focus-visible + .switch-track {
      outline: 1.5px solid var(--color-accent);
      outline-offset: 2px;
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
