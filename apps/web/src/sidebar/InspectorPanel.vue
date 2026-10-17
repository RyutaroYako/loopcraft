<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { refocusWhenLost } from "../editor/focus.ts";
import { injectEditor } from "../editor/useEditor.ts";
import DiagramInspector from "./DiagramInspector.vue";
import LinkInspector from "./LinkInspector.vue";
import LoopInspector from "./LoopInspector.vue";
import VariableInspector from "./VariableInspector.vue";

const { backupsAvailable } = defineProps<{ backupsAvailable: boolean }>();

const editor = injectEditor();
const selection = editor.selection;
const panel = useTemplateRef<HTMLElement>("panel");
// 選び直しても中身を使い回すと、出てくる動きが最初の 1 回しか付かない
const bodyKey = computed(() =>
  selection.value ? `${selection.value.kind}:${selection.value.id}` : "diagram",
);

function keepFocus() {
  refocusWhenLost(() => panel.value);
}
</script>

<!-- 選んでいないときに狭い画面で図の概要を先に出さないのは、一覧の方がよく使い、概要は広げたときに読めれば足りるため -->
<template>
  <section
    ref="panel"
    class="inspector-panel"
    :data-selected="selection ? '' : undefined"
    aria-label="選択中の項目"
    tabindex="-1"
  >
    <div :key="bodyKey" class="panel-body">
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
      <DiagramInspector v-else :backups-available @focus:lost="keepFocus" />
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
    order: 2;
    flex: none;
    overflow: visible;
    border-block-start: 1px solid var(--color-line);

    &[data-selected] {
      order: 0;
      border-block-start: none;
      border-block-end: 1px solid var(--color-line);
    }
  }

  > .panel-body {
    display: grid;
    gap: 18px;
    padding: 20px 20px 18px;
    animation: rise 0.35s var(--ease-out) both;
  }
}
</style>
