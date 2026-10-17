<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from "vue";
import * as edit from "@loopcraft/core/edit";
import type { VariableId } from "@loopcraft/core/schema";
import { injectEditor } from "../editor/useEditor.ts";
import type { Gesture } from "../editor/useEditor.ts";

const { id } = defineProps<{ id: VariableId }>();

const emit = defineEmits<{ "edit:finish": [id: VariableId, refocus: boolean] }>();

const editor = injectEditor();
const input = useTemplateRef<HTMLInputElement>("input");
const box = computed(() => editor.boxes.value.get(id));
const width = computed(() => Math.max(180, (box.value?.size.width ?? 0) + 24));
const center = computed(() => box.value?.center ?? { x: 0, y: 0 });
const original = editor.variableById.value.get(id)?.label ?? "";
// 入力のたびに commit しないのは、元に戻すが 1 文字ずつになり、Escape で取り消せないため。
// unmount で後始末しないのは、別の操作が割り込むとジェスチャーは自動で確定されるため
let gesture: Gesture | undefined;
let done = false;

// :value で渡さないのは、Vue が描き直すたびに入力欄の値を書き戻し、図の更新で入力中の文字が消えるため
onMounted(() => {
  if (input.value) input.value.value = original;
  input.value?.focus();
  input.value?.select();
});

function preview(label: string) {
  gesture ??= editor.beginGesture();
  gesture.preview(edit.updateVariable(editor.diagram.value, id, { label }));
}

function finish(how: "confirm" | "cancel" | "blur") {
  if (done) return;
  done = true;
  if (how === "cancel") {
    gesture?.cancel();
  } else {
    preview(input.value?.value.trim() ?? "");
    gesture?.end();
  }
  editor.setEditingVariable(null);
  // blur で戻さないのは、移った先から奪うため
  emit("edit:finish", id, how !== "blur");
}

function onInput(event: Event) {
  if (!(event as InputEvent).isComposing) preview((event.currentTarget as HTMLInputElement).value);
}

function onCompositionEnd(event: CompositionEvent) {
  preview((event.currentTarget as HTMLInputElement).value);
}

function onKeyDown(event: KeyboardEvent) {
  // Safari は変換確定の Enter を compositionend の後に isComposing=false で送るので keyCode も見る
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Enter") finish("confirm");
  if (event.key === "Escape") finish("cancel");
}
</script>

<template>
  <foreignObject
    class="inline-label-editor"
    :x="center.x - width / 2"
    :y="center.y - 20"
    :width
    height="40"
  >
    <input
      ref="input"
      class="label-input"
      name="variable-label-inline"
      aria-label="変数の名前"
      placeholder="例: 売上"
      @pointerdown.stop
      @input="onInput"
      @compositionend="onCompositionEnd"
      @keydown="onKeyDown"
      @blur="() => finish('blur')"
    />
  </foreignObject>
</template>

<style scoped>
.inline-label-editor {
  > .label-input {
    inline-size: 100%;
    block-size: 40px;
    border: 1.5px solid var(--color-accent);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    padding-inline: 14px;
    font-size: var(--text-md);
    font-weight: 500;
    text-align: center;
    outline: none;
  }
}
</style>
