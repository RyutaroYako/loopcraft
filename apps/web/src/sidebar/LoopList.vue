<script setup lang="ts">
import { injectEditor } from "../editor/useEditor.ts";
import EmptyMessage from "./EmptyMessage.vue";
import LoopListItem from "./LoopListItem.vue";
import RowList from "./RowList.vue";

const { hidden } = defineProps<{ hidden: boolean }>();

const editor = injectEditor();
const detection = editor.detection;
const loopEntries = editor.loopEntries;
</script>

<template>
  <div class="loop-list" :hidden>
    <p v-if="detection.truncated" class="truncated-warning">
      ループが多すぎるため、先頭の {{ detection.loops.length }} 件だけを表示しています
    </p>
    <RowList v-if="loopEntries.length > 0">
      <LoopListItem v-for="(entry, index) in loopEntries" :key="entry.key" :entry :index />
    </RowList>
    <EmptyMessage v-else>
      <p>ループはありません</p>
    </EmptyMessage>
  </div>
</template>

<style scoped>
.loop-list {
  display: flex;
  min-block-size: 0;
  flex-direction: column;

  > .truncated-warning {
    margin: 0 20px 10px;
    border-radius: var(--radius-sm);
    background: var(--color-warning-soft);
    padding: 8px 10px;
    font-size: var(--text-sm);
    color: var(--color-warning);
  }
}
</style>
