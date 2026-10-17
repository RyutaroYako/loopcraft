<script setup lang="ts">
import { injectEditor } from "../editor/useEditor.ts";
import HintTooltip from "../primitives/HintTooltip.vue";
import IconButton from "../primitives/IconButton.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import { mod } from "./shortcut.ts";

const { size = "default" } = defineProps<{ size?: "default" | "large" }>();

const editor = injectEditor();
const historySize = editor.historySize;
</script>

<template>
  <div class="history-buttons" :data-size="size" role="group" aria-label="履歴">
    <HintTooltip :text="`元に戻す (${mod}Z)`">
      <IconButton
        class="undo-button"
        :disabled="!editor.editable || historySize.undo === 0"
        aria-label="元に戻す"
        @click="editor.undo"
      >
        <SvgIcon name="undo" />
      </IconButton>
    </HintTooltip>
    <HintTooltip :text="`やり直す (${mod}Shift+Z)`">
      <IconButton
        class="redo-button"
        :disabled="!editor.editable || historySize.redo === 0"
        aria-label="やり直す"
        @click="editor.redo"
      >
        <SvgIcon name="redo" />
      </IconButton>
    </HintTooltip>
  </div>
</template>

<style scoped>
@layer components {
  .history-buttons {
    display: flex;
    align-items: center;
    gap: 2px;

    &[data-size="large"] {
      > .undo-button,
      > .redo-button {
        inline-size: 44px;
        block-size: 44px;
      }
    }
  }
}
</style>
