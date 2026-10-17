<script setup lang="ts">
import { computed } from "vue";
import type { Selection } from "../editor/emphasis.ts";
import { injectEditor } from "../editor/useEditor.ts";
import BaseButton from "../primitives/BaseButton.vue";
import { labelOf } from "../editor/labels.ts";

const { selection, expandable } = defineProps<{ selection: Selection; expandable: boolean }>();

const emit = defineEmits<{ "click:expand": [] }>();

const editor = injectEditor();

const title = computed(() => {
  if (selection.kind === "variable") return labelOf(editor, selection.id);
  if (selection.kind === "link") {
    const link = editor.linkById.value.get(selection.id);
    return `${labelOf(editor, link?.from)} → ${labelOf(editor, link?.to)}`;
  }
  return editor.loopEntryByLoopId.value.get(selection.id)?.featured?.loop.name || "ループ";
});
const deleteLabel = computed(
  () => ({ variable: "変数を削除", link: "関連を削除", loop: "注目から外す" })[selection.kind],
);
</script>

<template>
  <section class="selection-bar" aria-label="選択中の項目の操作">
    <h2 class="title-heading">{{ title }}</h2>
    <div class="action-buttons">
      <!-- 広い画面で出さないのは、一覧がキャンバスの横に並び、広げるものが無いため -->
      <BaseButton
        v-if="expandable"
        class="expand-button"
        variant="ghost"
        size="small"
        @click="() => emit('click:expand')"
      >
        詳しく
      </BaseButton>
      <!-- Delete キーだけにしないのは、指で使うときにはキーが無いため -->
      <BaseButton
        v-if="editor.editable"
        class="delete-button"
        variant="ghost"
        size="small"
        tone="danger"
        aria-keyshortcuts="Delete"
        @click="editor.deleteSelection"
      >
        {{ deleteLabel }}
      </BaseButton>
    </div>
  </section>
</template>

<style scoped>
.selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-block-end: 1px solid var(--color-line);
  background: var(--color-surface);
  padding: 12px 16px 8px;

  @media (width < 48rem) {
    position: sticky;
    inset-block-start: 24px;
    z-index: var(--z-raised);
    flex: none;
    padding-block-start: 0;
  }

  > .title-heading {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-lg);
    font-weight: 600;
  }

  > .action-buttons {
    display: flex;
    flex: none;
    gap: 4px;

    > .expand-button {
      @media (width < 48rem) {
        min-block-size: 40px;
      }

      @media (width >= 48rem) {
        display: none;
      }
    }

    > .delete-button {
      @media (width < 48rem) {
        min-block-size: 40px;
      }
    }
  }
}
</style>
