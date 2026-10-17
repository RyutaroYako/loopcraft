<script setup lang="ts">
import { computed } from "vue";
import * as edit from "@loopcraft/core/edit";
import type { LoopId } from "@loopcraft/core/schema";
import { injectEditor } from "../editor/useEditor.ts";
import BaseButton from "../primitives/BaseButton.vue";
import FieldHint from "../primitives/FieldHint.vue";
import FieldLabel from "../primitives/FieldLabel.vue";
import TextField from "../primitives/TextField.vue";
import LoopPath from "./LoopPath.vue";
import { kindExplanation, kindLabel } from "./loopText.ts";
import SectionHeading from "./SectionHeading.vue";

const { id } = defineProps<{ id: LoopId }>();

const emit = defineEmits<{ "focus:lost": [] }>();

const editor = injectEditor();
const entry = computed(() => editor.loopEntryByLoopId.value.get(id));
const loop = computed(() => entry.value?.featured?.loop);
const negatives = computed(
  () =>
    (entry.value?.links ?? []).filter(
      (linkId) => editor.linkById.value.get(linkId)?.polarity === "-",
    ).length,
);

function update(patch: Parameters<typeof edit.updateLoop>[2], key?: string) {
  editor.commit(edit.updateLoop(editor.diagram.value, id, patch), key);
}

function resetMarker() {
  update({ marker: undefined });
  // 戻さないと、押したボタンが消えてフォーカスが失われる
  emit("focus:lost");
}
</script>

<template>
  <SectionHeading
    :kicker="entry?.featured?.badge ?? 'Loop'"
    :title="kindLabel(entry?.kind ?? 'reinforcing')"
  />
  <TextField
    name="loop-name"
    label="名前"
    :value="loop?.name ?? ''"
    placeholder="例: 成長エンジン"
    :readonly="!editor.editable"
    @update:value="(name) => update({ name }, `name:${id}`)"
  />
  <TextField
    name="loop-description"
    label="説明"
    :value="loop?.description ?? ''"
    placeholder="このループが何を引き起こすか"
    multiline
    :readonly="!editor.editable"
    @update:value="
      (description) => update({ description: description || undefined }, `description:${id}`)
    "
  />
  <div class="route-field">
    <FieldLabel>経路</FieldLabel>
    <LoopPath :links="entry?.links ?? []" :variables="entry?.variables ?? []" />
    <FieldHint>{{ kindExplanation(negatives) }}</FieldHint>
  </div>
  <div v-if="editor.editable && loop?.marker !== undefined" class="reset-area">
    <BaseButton variant="ghost" size="small" @click="resetMarker">記号の位置を戻す</BaseButton>
  </div>
</template>

<style scoped>
.route-field {
  display: grid;
  gap: 6px;
}

.reset-area {
  display: flex;
  gap: 8px;
  margin-block-start: -6px;
}
</style>
