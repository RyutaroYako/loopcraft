<script setup lang="ts">
import { VisuallyHidden } from "reka-ui";

const { title, readonly } = defineProps<{ title: string; readonly: boolean }>();

const emit = defineEmits<{ "update:title": [title: string] }>();

// 変換中に知らせないのは、確定前の読みを図に書き込むと、取り消しや自動保存が読みの途中で走るため
function onInput(event: Event) {
  if ((event as InputEvent).isComposing) return;
  emit("update:title", (event.currentTarget as HTMLInputElement).value);
}

function onCompositionEnd(event: CompositionEvent) {
  emit("update:title", (event.currentTarget as HTMLInputElement).value);
}
</script>

<!--
  ツールバーに直接置かないのは、Vue が描き直すたびに入力欄の値を書き戻すため。
  自動保存の表示などでツールバーが描き直されると、変換中の文字が消える
-->
<template>
  <label class="title-field">
    <VisuallyHidden>図のタイトル</VisuallyHidden>
    <input
      class="title-input"
      name="title"
      :value="title"
      :readonly
      placeholder="無題のシステム図"
      @input="onInput"
      @compositionend="onCompositionEnd"
    />
  </label>
</template>

<style scoped>
.title-field {
  min-inline-size: 0;

  > .title-input {
    block-size: 34px;
    inline-size: min(100%, 440px);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    padding-inline: 10px;
    font-size: var(--text-lg);
    font-weight: 500;
    letter-spacing: var(--tracking-heading);
    transition-property: background-color, border-color;
    transition-duration: var(--duration-fast);
    transition-timing-function: var(--ease-out);

    &:hover {
      @media (hover: hover) {
        background: var(--color-surface-2);
      }
    }

    &:focus {
      border-color: var(--color-accent);
      background: var(--color-surface);
      outline: none;
    }
  }
}
</style>
