<script setup lang="ts">
import FieldHint from "./FieldHint.vue";
import FieldLabel from "./FieldLabel.vue";

const {
  label,
  value,
  name,
  placeholder,
  hint,
  multiline = false,
  code = false,
  readonly = false,
  initialFocus = false,
} = defineProps<{
  label: string;
  value: string;
  name?: string;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  code?: boolean;
  readonly?: boolean;
  initialFocus?: boolean;
}>();

const emit = defineEmits<{
  "update:value": [value: string];
  "focus:field": [event: FocusEvent];
}>();

// 変換中に知らせないのは、確定前の読みを図に書き込むと、取り消しや自動保存が読みの途中で走るため
function onInput(event: Event) {
  if ((event as InputEvent).isComposing) return;
  emit("update:value", (event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value);
}

function onCompositionEnd(event: CompositionEvent) {
  emit("update:value", (event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value);
}
</script>

<template>
  <label class="text-field">
    <FieldLabel>{{ label }}</FieldLabel>
    <textarea
      v-if="multiline || code"
      class="value-textarea"
      :data-code="code ? '' : undefined"
      :name
      :value
      :placeholder
      :readonly
      :data-autofocus="initialFocus ? '' : undefined"
      :rows="3"
      :spellcheck="code ? false : undefined"
      @input="onInput"
      @compositionend="onCompositionEnd"
      @focus="(event) => emit('focus:field', event)"
    />
    <input
      v-else
      class="value-input"
      :name
      :value
      :placeholder
      :readonly
      :data-autofocus="initialFocus ? '' : undefined"
      @input="onInput"
      @compositionend="onCompositionEnd"
      @focus="(event) => emit('focus:field', event)"
    />
    <FieldHint v-if="hint">{{ hint }}</FieldHint>
  </label>
</template>

<style scoped>
@layer components {
  .text-field {
    display: grid;
    gap: 6px;

    > .value-textarea,
    > .value-input {
      inline-size: 100%;
      border: 1px solid var(--color-line);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      transition: border-color var(--duration-fast) var(--ease-out);

      &:hover {
        border-color: var(--color-line-strong);
      }

      &:focus {
        outline: none;
        border-color: var(--color-accent);
      }
    }

    > .value-input {
      block-size: 36px;
      padding-inline: 10px;
    }

    > .value-textarea {
      min-block-size: 76px;
      padding: 8px 10px;
      resize: vertical;
      line-height: 1.55;

      &[data-code] {
        min-block-size: 280px;
        font-family: var(--font-mono);
        font-size: var(--text-sm);
        line-height: 1.5;
        white-space: pre;
      }
    }
  }
}
</style>
