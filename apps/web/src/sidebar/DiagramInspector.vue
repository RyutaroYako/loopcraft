<script setup lang="ts">
import * as edit from "@loopcraft/core/edit";
import { injectEditor } from "../editor/useEditor.ts";
import TextField from "../primitives/TextField.vue";
import SectionHeading from "./SectionHeading.vue";

const editor = injectEditor();
const diagram = editor.diagram;

function setDescription(value: string) {
  editor.commit(edit.setDescription(editor.diagram.value, value), "diagram-description");
}
</script>

<template>
  <SectionHeading kicker="Diagram" title="図の概要" />
  <TextField
    name="diagram-description"
    label="この図で伝えたいこと"
    :value="diagram.description ?? ''"
    placeholder="例: 人を増やすほど成長するが、育成の負担が成長を押し戻す"
    multiline
    :readonly="!editor.editable"
    :hint="
      editor.editable
        ? '変数・矢印・ループを選ぶと、ここで編集できます'
        : '変数・矢印・ループを選ぶと、ここで詳しく見られます'
    "
    @update:value="setDescription"
  />
</template>
