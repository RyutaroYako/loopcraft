<script setup lang="ts">
import { injectEditor } from "../editor/useEditor.ts";
import BaseButton from "../primitives/BaseButton.vue";
import HintTooltip from "../primitives/HintTooltip.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import HistoryButtons from "../toolbar/HistoryButtons.vue";

const { empty } = defineProps<{ empty: boolean }>();

const editor = injectEditor();

function addVariable() {
  editor.addVariableAt(editor.viewCenter());
}
</script>

<!-- ツールバーの履歴と別に置くのは、狭い画面では親指の届く下端に操作を寄せるため -->
<template>
  <div class="canvas-actions">
    <!-- 広い画面で出さないのは、ツールバーに同じボタンがあるため -->
    <HistoryButtons class="undo-redo-buttons" size="large" />
    <!-- 空のときに出さないのは、案内に同じボタンがあるため -->
    <HintTooltip v-if="!empty" text="空いた所のダブルクリックでも追加できます">
      <BaseButton class="add-variable-button" variant="primary" @click="addVariable">
        <SvgIcon name="plus" />
        変数を追加
      </BaseButton>
    </HintTooltip>
  </div>
</template>

<style scoped>
.canvas-actions {
  position: absolute;
  inset-block-end: 16px;
  inset-inline-end: 16px;
  display: flex;

  @media (width < 48rem) {
    inset-block-end: 28px;
    inset-inline: 12px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    pointer-events: none;
  }

  > .undo-redo-buttons {
    gap: 0;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-xl);
    background: var(--color-glass);
    padding: 2px;
    box-shadow: var(--shadow-float);
    backdrop-filter: blur(8px);
    pointer-events: auto;

    @media (width >= 48rem) {
      display: none;
    }
  }

  > .add-variable-button {
    margin-inline-start: auto;
    block-size: 48px;
    border-color: var(--color-accent);
    border-radius: var(--radius-xl);
    background: var(--color-accent);
    padding-inline: 14px 18px;
    font-size: var(--text-lg);
    box-shadow: var(--shadow-accent);
    pointer-events: auto;

    &:enabled:hover {
      @media (hover: hover) {
        border-color: var(--color-accent-strong);
        background: var(--color-accent-strong);
      }
    }
  }
}
</style>
