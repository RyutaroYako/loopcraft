<script setup lang="ts">
import { computed } from "vue";
import { injectEditor } from "../editor/useEditor.ts";
import InspectorPanel from "./InspectorPanel.vue";
import ListTabs from "./ListTabs.vue";
import SelectionBar from "./SelectionBar.vue";
import SheetHandle from "./SheetHandle.vue";
import { useBottomSheet } from "./useBottomSheet.ts";

const emit = defineEmits<{ "canvas:reveal": [] }>();

const editor = injectEditor();
const selection = editor.selection;
const sheet = useBottomSheet();
const sheetHeight = computed(() => ({ "--sheet-height": `${sheet.height.value}px` }));
</script>

<!-- 狭い画面用に別の部品を作らないのは、中身も状態も同じで、並べ方だけが違うため -->
<template>
  <aside
    class="editor-sidebar"
    :data-selected="selection ? '' : undefined"
    :data-sheet-size="sheet.size.value"
    :data-dragging="sheet.dragging.value ? '' : undefined"
    :style="sheetHeight"
  >
    <SheetHandle :sheet />
    <!-- 詳細を一覧の上に置かないのは、選んで詳細が出たときに一覧が下へずれ、押した行がカーソルの下から動くため -->
    <ListTabs @canvas:reveal="() => emit('canvas:reveal')" />
    <!--
      狭い画面で包みを残さないのは、上端の操作バーをシート全体のスクロールに対して貼り付けるため。
      選んだときにシートを上げないのは、動かそうと触れた変数や、その行き先がシートの下に隠れるため
    -->
    <div v-if="selection" class="inspection-area">
      <SelectionBar
        :selection
        :expandable="sheet.size.value === 'peek'"
        @click:expand="() => sheet.setSize('half')"
      />
      <InspectorPanel />
    </div>
  </aside>
</template>

<style scoped>
/*
 * 選んだときに中身の高さで分けないのは、選ぶたびに一覧の見える高さが変わり、読んでいた行が隠れるため。
 * 狭い画面で縮ませないのは、シートの高さに押し込められて一覧と詳細が重なるため。スクロールはシート全体で受ける
 */
.editor-sidebar {
  display: grid;
  min-block-size: 0;
  grid-template-rows: minmax(0, 1fr);
  border-inline-start: 1px solid var(--color-line);
  background: var(--color-surface);

  &[data-selected] {
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  }

  @media (width < 48rem) {
    position: relative;
    z-index: var(--z-sheet);
    display: flex;
    block-size: var(--sheet-height);
    flex-direction: column;
    margin-block-start: -16px;
    overflow-y: auto;
    overscroll-behavior: contain;
    border-inline-start: none;
    border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
    padding-block-end: env(safe-area-inset-bottom);
    box-shadow: var(--shadow-sheet);
    transition: block-size 300ms var(--ease-out);

    > * {
      flex: none;
      overflow: visible;
    }

    /* 指で動かしている間も遷移を残さないのは、遅れて付いてきて取っ手が指から離れるため */
    &[data-dragging] {
      transition: none;
    }
  }

  > .inspection-area {
    display: flex;
    min-block-size: 0;
    flex-direction: column;
    border-block-start: 1px solid var(--color-line);

    @media (width < 48rem) {
      display: contents;

      > * {
        flex: none;
        overflow: visible;
      }
    }
  }
}
</style>
