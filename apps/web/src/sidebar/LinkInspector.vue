<script setup lang="ts">
import { computed, useId } from "vue";
import * as edit from "@loopcraft/core/edit";
import { defaultCurvature } from "@loopcraft/core/geometry";
import type { LinkId, Polarity } from "@loopcraft/core/schema";
import { injectEditor } from "../editor/useEditor.ts";
import BaseButton from "../primitives/BaseButton.vue";
import FieldHint from "../primitives/FieldHint.vue";
import FieldLabel from "../primitives/FieldLabel.vue";
import SegmentedControl from "../primitives/SegmentedControl.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import TextField from "../primitives/TextField.vue";
import ToggleSwitch from "../primitives/ToggleSwitch.vue";
import { labelOf } from "../editor/labels.ts";
import PolarityGlyph from "./PolarityGlyph.vue";
import SectionHeading from "./SectionHeading.vue";

const POLARITY_OPTIONS = [
  { value: "+", label: "同じ向きに動く" },
  { value: "-", label: "逆向きに動く" },
] as const satisfies readonly { value: Polarity; label: string }[];

const { id } = defineProps<{ id: LinkId }>();

const emit = defineEmits<{ "focus:lost": [] }>();

const editor = injectEditor();
const polarityLabelId = useId();
const link = computed(() => editor.linkById.value.get(id));
const from = computed(() => labelOf(editor, link.value?.from));
const to = computed(() => labelOf(editor, link.value?.to));
const reversed = computed(() => link.value !== undefined && editor.hasReverse(link.value));
// undefined かどうかだけで見ないのは、既定と同じ値が明示されていることがあるため
const customCurvature = computed(() => {
  const curvature = link.value?.curvature;
  return curvature !== undefined && curvature !== defaultCurvature(reversed.value);
});

function update(patch: Parameters<typeof edit.updateLink>[2], key?: string) {
  editor.commit(edit.updateLink(editor.diagram.value, id, patch), key);
}

function selectEnd(end: "from" | "to") {
  const variable = link.value?.[end];
  if (variable) editor.select({ kind: "variable", id: variable });
}

function resetCurvature() {
  update({ curvature: undefined });
  // 戻さないと、押したボタンが消えてフォーカスが失われる
  emit("focus:lost");
}
</script>

<template>
  <SectionHeading kicker="Link" title="関連" />
  <p class="route-buttons">
    <button type="button" class="from-button" @click="() => selectEnd('from')">{{ from }}</button>
    <SvgIcon class="arrow-icon" name="arrow-right" />
    <button type="button" class="to-button" @click="() => selectEnd('to')">{{ to }}</button>
  </p>
  <fieldset class="polarity-field">
    <FieldLabel :id="polarityLabelId" as="legend">極性</FieldLabel>
    <SegmentedControl
      :aria-labelledby="polarityLabelId"
      :options="POLARITY_OPTIONS"
      :value="link?.polarity"
      :disabled="!editor.editable"
      @update:value="(polarity) => update({ polarity })"
    >
      <template #icon="{ value }">
        <PolarityGlyph :polarity="value" />
      </template>
    </SegmentedControl>
    <FieldHint>
      {{
        link?.polarity === "-" ? `${from}が増えると${to}は減る` : `${from}が増えると${to}も増える`
      }}
    </FieldHint>
  </fieldset>
  <ToggleSwitch
    name="delay"
    label="遅れがある"
    hint="影響が現れるまで時間がかかる関連に二重線を付けます"
    :checked="link?.delay ?? false"
    :disabled="!editor.editable"
    @update:checked="(delay) => update({ delay: delay || undefined })"
  />
  <TextField
    name="link-description"
    label="説明"
    :value="link?.description ?? ''"
    placeholder="なぜこの因果があると言えるか"
    multiline
    :readonly="!editor.editable"
    @update:value="
      (description) => update({ description: description || undefined }, `description:${id}`)
    "
  />
  <!-- 曲がり具合を付ける操作が無いのに戻す操作を置くのは、以前の版や JSON で付いたものを戻す手段がここしか無いため -->
  <div v-if="editor.editable && customCurvature" class="reset-area">
    <BaseButton variant="ghost" size="small" @click="resetCurvature">
      {{ reversed ? "標準の曲線に戻す" : "直線に戻す" }}
    </BaseButton>
  </div>
</template>

<style scoped>
.route-buttons {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--color-faint);

  > .from-button,
  > .to-button {
    border: 1px solid var(--color-line);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    padding: 4px 10px;
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--color-ink);
    transition: border-color var(--duration-fast) var(--ease-out);

    &:hover {
      @media (hover: hover) {
        border-color: var(--color-accent);
      }
    }
  }
}

.polarity-field {
  display: grid;
  gap: 6px;
}

.reset-area {
  display: flex;
  gap: 8px;
  margin-block-start: -6px;
}
</style>
