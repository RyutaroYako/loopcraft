<script setup lang="ts">
import type { BottomSheet } from "./useBottomSheet.ts";

const { sheet } = defineProps<{ sheet: BottomSheet }>();
</script>

<!-- 広い画面で出さないのは、一覧がキャンバスの横に並び、引き出すものが無いため -->
<template>
  <button
    type="button"
    class="sheet-handle"
    :aria-label="sheet.size.value === 'full' ? 'パネルを畳む' : 'パネルを広げる'"
    :aria-expanded="sheet.size.value !== 'peek'"
    @click="sheet.handle.onClick"
    @pointerdown="sheet.handle.onPointerDown"
    @pointermove="sheet.handle.onPointerMove"
    @pointerup="sheet.handle.onPointerUp"
    @pointercancel="sheet.handle.onPointerUp"
  >
    <span class="grip-bar" aria-hidden="true" />
  </button>
</template>

<style scoped>
.sheet-handle {
  position: sticky;
  inset-block-start: 0;
  z-index: var(--z-raised);
  display: grid;
  block-size: 24px;
  inline-size: 100%;
  flex: none;
  cursor: grab;
  touch-action: none;
  place-items: center;
  background: var(--color-surface);

  @media (width >= 48rem) {
    display: none;
  }

  > .grip-bar {
    block-size: 4px;
    inline-size: 36px;
    border-radius: var(--radius-full);
    background: var(--color-line-strong);
  }
}
</style>
