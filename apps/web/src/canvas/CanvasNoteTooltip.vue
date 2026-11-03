<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from "reka-ui";
import type { CanvasNote } from "./note.ts";

const { note } = defineProps<{ note: CanvasNote | null }>();

const emit = defineEmits<{ "note:close": [] }>();
</script>

<!--
  矢印や記号の中に TooltipRoot を置かないのは、SVG の中で書いた要素は body へ移しても SVG の要素として作られ、
  div や p が描かれないため。キャンバスの外側に 1 つだけ置き、重ねた要素を位置の基準にする
-->
<template>
  <TooltipRoot
    :open="note !== null"
    :delay-duration="0"
    disable-hoverable-content
    @update:open="(open) => !open && emit('note:close')"
  >
    <TooltipTrigger as-child :reference="note?.target">
      <span class="anchor-area" aria-hidden="true" />
    </TooltipTrigger>
    <TooltipPortal>
      <!-- 自分の div で描かせるのは、reka-ui の要素には scoped の印が付かず、スタイルが当たらないため -->
      <TooltipContent as-child side="bottom" :side-offset="8" :collision-padding="8">
        <div class="canvas-note-tooltip">
          <p v-if="note?.title" class="title-text">{{ note.title }}</p>
          <p v-if="note?.text" class="body-text">{{ note.text }}</p>
        </div>
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>

<style scoped>
.anchor-area {
  position: absolute;
  inline-size: 0;
  block-size: 0;
}

.canvas-note-tooltip {
  z-index: var(--z-popover);
  display: grid;
  max-inline-size: 280px;
  gap: 4px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: 10px 12px;
  box-shadow: var(--shadow-float);
  pointer-events: none;

  > .title-text {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-ink);
  }

  > .body-text {
    font-size: var(--text-base);
    line-height: 1.7;
    color: var(--color-ink-2);
  }
}
</style>
