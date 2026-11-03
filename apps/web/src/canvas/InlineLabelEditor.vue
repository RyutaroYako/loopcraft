<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from "vue";
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
const added = editor.takeUnnamedVariable(id);
// 入力のたびに commit しないのは、元に戻すが 1 文字ずつになり、Escape で取り消せないため。
// 開いた時点で始めるのは、入力の途中で割り込んだ操作が、空の変数の追加を確定させないため
const gesture: Gesture = added ?? editor.beginGesture();
let done = false;
editor.setNamingSettler(() => finish("blur"));

// :value で渡さないのは、Vue が描き直すたびに入力欄の値を書き戻し、図の更新で入力中の文字が消えるため
onMounted(() => {
  if (input.value) input.value.value = original;
  input.value?.focus();
  input.value?.select();
});

function preview(label: string) {
  gesture.preview(edit.updateVariable(editor.diagram.value, id, { label }));
}

// blur に任せないのは、ほかの変数を押すと入力欄が先に取り除かれ、blur が届かないことがあるため
onBeforeUnmount(() => finish("blur"));

function finish(how: "confirm" | "cancel" | "blur") {
  if (done) return;
  done = true;
  editor.setNamingSettler(undefined);
  const label = input.value?.value.trim() ?? "";
  if (how === "cancel" || (added && label === "")) {
    gesture.cancel();
  } else {
    preview(label);
    gesture.end();
  }
  editor.setEditingVariable(null);
  if (added && label === "") {
    // ジェスチャーの取り消しだけで済ませないのは、名前の入力中に別の編集が入ると、足した操作が確定済みになるため
    if (editor.variableById.value.has(id)) {
      editor.commit(edit.removeVariable(editor.diagram.value, id));
    }
    editor.select(null);
  }
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
