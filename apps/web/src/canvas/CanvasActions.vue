<script setup lang="ts">
import { injectEditor } from "../editor/useEditor.ts";
import BaseButton from "../primitives/BaseButton.vue";
import HintTooltip from "../primitives/HintTooltip.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import HistoryButtons from "./HistoryButtons.vue";
import ZoomControls from "./ZoomControls.vue";

const { empty } = defineProps<{ empty: boolean }>();

const editor = injectEditor();
const diagram = editor.diagram;

function addVariable() {
  editor.addVariableAt(editor.viewCenter());
}
</script>

<!-- ツールバーに置かないのは、図そのものへの操作を、操作する図のそばに寄せるため。狭い画面では親指の届く下端に来る -->
<template>
  <div class="canvas-actions">
    <div v-if="editor.editable" class="edit-tool-area" role="group" aria-label="編集">
      <HistoryButtons class="undo-redo-buttons" size="touch" />
      <span class="tool-divider" />
      <HintTooltip text="変数の配置を自動で整える">
        <BaseButton
          class="layout-button"
          variant="ghost"
          :disabled="diagram.variables.length < 2"
          aria-label="整列"
          @click="editor.autoLayout"
        >
          <SvgIcon name="layout" />
          <span class="button-label">整列</span>
        </BaseButton>
      </HintTooltip>
    </div>
    <ZoomControls class="zoom-toolbar" :empty />
    <!-- 空のときに出さないのは、案内に同じボタンがあるため -->
    <HintTooltip v-if="editor.editable && !empty" text="空いた所のダブルクリックでも追加できます">
      <BaseButton class="add-variable-button" variant="primary" @click="addVariable">
        <SvgIcon name="plus" />
        変数を追加
      </BaseButton>
    </HintTooltip>
  </div>
</template>

<style scoped>
/*
 * 狭い画面で包みを残さないのは、拡大縮小は右上、編集と追加は下端と、子ごとに置く場所が分かれるため
 */
.canvas-actions {
  position: absolute;
  inset-block-end: 16px;
  inset-inline: 16px;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;

  @media (width < 48rem) {
    display: contents;
  }

  > * {
    pointer-events: auto;
  }

  > .edit-tool-area {
    display: flex;
    align-items: center;
    gap: 2px;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-lg);
    background: var(--color-glass);
    padding: 4px;
    box-shadow: var(--shadow-float);
    backdrop-filter: blur(8px);

    @media (width < 48rem) {
      position: absolute;
      inset-block-end: 28px;
      inset-inline-start: 12px;
      border-radius: var(--radius-xl);
      padding: 2px;
    }

    > .tool-divider {
      margin-inline: 4px;
      block-size: 18px;
      inline-size: 1px;
      background: var(--color-line);
    }

    > .layout-button {
      block-size: 32px;
      padding-inline: 8px 10px;

      @media (width < 48rem) {
        inline-size: 44px;
        block-size: 44px;
        padding-inline: 0;
      }

      > .button-label {
        @media (width < 48rem) {
          display: none;
        }
      }
    }
  }

  > .zoom-toolbar {
    @media (width < 48rem) {
      position: absolute;
      inset-block-start: 12px;
      inset-inline-end: 12px;
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

    @media (width < 48rem) {
      position: absolute;
      inset-block-end: 28px;
      inset-inline-end: 12px;
    }

    &:enabled:hover {
      @media (hover: hover) {
        border-color: var(--color-accent-strong);
        background: var(--color-accent-strong);
      }
    }
  }
}
</style>
