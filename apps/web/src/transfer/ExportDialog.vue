<script setup lang="ts">
import { stringifyDiagram } from "@loopcraft/core/io";
import { injectEditor } from "../editor/useEditor.ts";
import BaseButton from "../primitives/BaseButton.vue";
import CopyButton from "../primitives/CopyButton.vue";
import ModalDialog from "../primitives/ModalDialog.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import TextField from "../primitives/TextField.vue";

const emit = defineEmits<{ "dialog:close": [] }>();

const editor = injectEditor();
// 図に追従させないのは、開いている間は図を編集できず変わらないため
const text = stringifyDiagram(editor.diagram.value);

function copy() {
  return navigator.clipboard.writeText(text);
}

function selectAll(event: FocusEvent) {
  (event.target as HTMLTextAreaElement).select();
}
</script>

<template>
  <ModalDialog title="JSON を書き出す" @dialog:close="() => emit('dialog:close')">
    <TextField label="図の JSON" :value="text" code readonly @focus:field="selectAll" />
    <template #footer-start>
      <BaseButton variant="ghost" @click="editor.exportFile">
        <SvgIcon name="save" />
        ファイルに保存
      </BaseButton>
    </template>
    <template #footer>
      <CopyButton :copy />
    </template>
  </ModalDialog>
</template>
