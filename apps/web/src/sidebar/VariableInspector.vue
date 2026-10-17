<script setup lang="ts">
import { computed } from "vue";
import * as edit from "@loopcraft/core/edit";
import type { VariableId } from "@loopcraft/core/schema";
import { injectEditor } from "../editor/useEditor.ts";
import TextField from "../primitives/TextField.vue";
import { labelOf } from "../editor/labels.ts";
import RelationList from "./RelationList.vue";
import SectionHeading from "./SectionHeading.vue";

const { id } = defineProps<{ id: VariableId }>();

const editor = injectEditor();
const variable = computed(() => editor.variableById.value.get(id));
const related = computed(() => {
  const links = editor.diagram.value.links;
  return {
    causes: links.filter((link) => link.to === id),
    effects: links.filter((link) => link.from === id),
  };
});

function update(patch: Parameters<typeof edit.updateVariable>[2], key: string) {
  editor.commit(edit.updateVariable(editor.diagram.value, id, patch), `${key}:${id}`);
}
</script>

<template>
  <SectionHeading kicker="Variable" title="変数" />
  <TextField
    name="variable-label"
    label="名前"
    :value="variable?.label ?? ''"
    placeholder="例: 売上"
    :readonly="!editor.editable"
    @update:value="(label) => update({ label }, 'label')"
  />
  <TextField
    name="variable-description"
    label="説明"
    :value="variable?.description ?? ''"
    placeholder="何を数えるか、どう測るか"
    multiline
    :readonly="!editor.editable"
    @update:value="
      (description) => update({ description: description || undefined }, 'description')
    "
  />
  <div class="relation-columns">
    <RelationList
      title="原因"
      empty="この変数に影響する矢印はありません"
      :links="related.causes"
      :label-of="(link) => labelOf(editor, link.from)"
      @select:link="(linkId) => editor.select({ kind: 'link', id: linkId })"
    />
    <RelationList
      title="結果"
      empty="この変数から出る矢印はありません"
      :links="related.effects"
      :label-of="(link) => labelOf(editor, link.to)"
      @select:link="(linkId) => editor.select({ kind: 'link', id: linkId })"
    />
  </div>
</template>

<style scoped>
.relation-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
</style>
