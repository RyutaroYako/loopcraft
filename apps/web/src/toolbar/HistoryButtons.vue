<script setup lang="ts">
import { injectEditor } from "../editor/useEditor.ts";
import IconButton from "../primitives/IconButton.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import { mod } from "./shortcut.ts";

const { size = "default" } = defineProps<{ size?: "default" | "large" }>();

const editor = injectEditor();
const historySize = editor.historySize;
</script>

<template>
  <div class="history-buttons" :data-size="size" role="group" aria-label="履歴">
    <IconButton
      class="undo-button"
      :disabled="!editor.editable || historySize.undo === 0"
      :title="`元に戻す (${mod}Z)`"
      aria-label="元に戻す"
      @click="editor.undo"
    >
      <SvgIcon name="undo" />
    </IconButton>
    <IconButton
      class="redo-button"
      :disabled="!editor.editable || historySize.redo === 0"
      :title="`やり直す (${mod}Shift+Z)`"
      aria-label="やり直す"
      @click="editor.redo"
    >
      <SvgIcon name="redo" />
    </IconButton>
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
