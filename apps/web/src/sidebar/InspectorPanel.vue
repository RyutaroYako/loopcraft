<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { refocusWhenLost } from "../editor/focus.ts";
import { injectEditor } from "../editor/useEditor.ts";
import LinkInspector from "./LinkInspector.vue";
import LoopInspector from "./LoopInspector.vue";
import VariableInspector from "./VariableInspector.vue";

const editor = injectEditor();
const selection = editor.selection;
const panel = useTemplateRef<HTMLElement>("panel");
// 選び直しても中身を使い回すと、出てくる動きが最初の 1 回しか付かない
const bodyKey = computed(() => `${selection.value?.kind}:${selection.value?.id}`);
// 見出しを付けないのは、上の操作バーに選んだものの名前が出ていて、見た目では繰り返しになるため
const bodyLabel = computed(() =>
  selection.value?.kind === "variable"
    ? "変数"
    : selection.value?.kind === "link"
      ? "関連"
      : undefined,
);

function keepFocus() {
  refocusWhenLost(() => panel.value);
}
</script>

<template>
  <section ref="panel" class="inspector-panel" aria-label="選択中の項目" tabindex="-1">
    <div
      :key="bodyKey"
      class="panel-body"
      :role="bodyLabel ? 'group' : undefined"
      :aria-label="bodyLabel"
    >
      <VariableInspector v-if="selection?.kind === 'variable'" :id="selection.id" />
      <LinkInspector
        v-else-if="selection?.kind === 'link'"
        :id="selection.id"
        @focus:lost="keepFocus"
      />
      <LoopInspector
        v-else-if="selection?.kind === 'loop'"
        :id="selection.id"
        @focus:lost="keepFocus"
      />
    </div>
  </section>
</template>

<style scoped>
.inspector-panel {
  min-block-size: 0;
  flex: 1;
  overflow-y: auto;
  outline: none;

  @media (width < 48rem) {
    flex: none;
    overflow: visible;
    border-block-end: 1px solid var(--color-line);
  }

  > .panel-body {
    display: grid;
    gap: 18px;
    padding: 20px 20px 18px;
    animation: rise 0.35s var(--ease-out) both;
  }
}
</style>
