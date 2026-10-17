<script setup lang="ts">
import { injectEditor } from "../editor/useEditor.ts";
import EmptyMessage from "./EmptyMessage.vue";
import LoopListItem from "./LoopListItem.vue";
import RowList from "./RowList.vue";

const { id, hidden, labelledBy } = defineProps<{
  id: string;
  hidden: boolean;
  labelledBy: string;
}>();

const editor = injectEditor();
const detection = editor.detection;
const loopEntries = editor.loopEntries;
</script>

<template>
  <div :id class="loop-list" role="tabpanel" :hidden :aria-labelledby="labelledBy">
    <p v-if="detection.truncated" class="truncated-warning">
      ループが多すぎるため、先頭の {{ detection.loops.length }} 件だけを表示しています
    </p>
    <RowList v-if="loopEntries.length > 0">
      <LoopListItem v-for="(entry, index) in loopEntries" :key="entry.key" :entry :index />
    </RowList>
    <EmptyMessage v-else>
      <svg class="loop-illustration" viewBox="0 0 64 40" aria-hidden="true">
        <path d="M14 20a10 10 0 1 1 10 10h-6" />
        <path d="M50 20a10 10 0 1 1-10-10h6" />
        <path d="m20 26-3 4 4 3" />
        <path d="m44 14 3-4-4-3" />
      </svg>
      <p>矢印をつないで輪を作ると、ここにループが自動で現れます</p>
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

  .loop-illustration {
    block-size: 40px;
    inline-size: 64px;
    fill: none;
    stroke: var(--color-line-strong);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}
</style>
