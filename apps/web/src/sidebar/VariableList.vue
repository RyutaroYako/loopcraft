<script setup lang="ts">
import { computed, ref } from "vue";
import type { VariableId } from "@loopcraft/core/schema";
import { VisuallyHidden } from "reka-ui";
import { UNNAMED } from "../editor/boxes.ts";
import { injectEditor } from "../editor/useEditor.ts";
import EmptyMessage from "./EmptyMessage.vue";
import ListRow from "./ListRow.vue";
import RowList from "./RowList.vue";

const { hidden } = defineProps<{ hidden: boolean }>();

const emit = defineEmits<{ "canvas:reveal": [] }>();

const editor = injectEditor();
const diagram = editor.diagram;
const query = ref("");

const degrees = computed(() => {
  const counts = new Map<VariableId, { causes: number; effects: number }>();
  // 隠れている間も数えると、ドラッグの途中経過のたびに数え直してしまう
  if (hidden) return counts;
  const countOf = (id: VariableId) => {
    let count = counts.get(id);
    if (!count) counts.set(id, (count = { causes: 0, effects: 0 }));
    return count;
  };
  for (const link of diagram.value.links) {
    countOf(link.from).effects++;
    countOf(link.to).causes++;
  }
  return counts;
});

const visible = computed(() => {
  if (hidden) return [];
  const words = query.value.trim().toLowerCase();
  return diagram.value.variables.filter((variable) =>
    (variable.label || UNNAMED).toLowerCase().includes(words),
  );
});

const selectedId = computed(() => {
  const selection = editor.selection.value;
  return selection?.kind === "variable" ? selection.id : undefined;
});

function choose(id: VariableId) {
  editor.select({ kind: "variable", id });
  const variable = editor.variableById.value.get(id);
  if (variable) editor.centerOn(variable.position);
  emit("canvas:reveal");
}

function onSearch(event: Event) {
  query.value = (event.currentTarget as HTMLInputElement).value;
}
</script>

<template>
  <div class="variable-list" :hidden>
    <label v-if="diagram.variables.length > 0" class="search-field">
      <VisuallyHidden>変数を名前で絞り込む</VisuallyHidden>
      <input
        class="search-input"
        type="search"
        name="variable-search"
        placeholder="名前で絞り込む"
        :value="query"
        @input="onSearch"
      />
    </label>
    <RowList v-if="visible.length > 0">
      <ListRow
        v-for="(variable, index) in visible"
        :key="variable.id"
        :active="selectedId === variable.id"
        :index
        @click:row="() => choose(variable.id)"
      >
        <template #title>{{ variable.label || UNNAMED }}</template>
        <template #route>
          原因 {{ degrees.get(variable.id)?.causes ?? 0 }} ・ 結果
          {{ degrees.get(variable.id)?.effects ?? 0 }}
        </template>
      </ListRow>
    </RowList>
    <EmptyMessage v-else>
      <p>
        {{
          diagram.variables.length === 0
            ? "変数を追加すると、ここに並びます"
            : "名前が一致する変数はありません"
        }}
      </p>
    </EmptyMessage>
  </div>
</template>

<style scoped>
.variable-list {
  display: flex;
  min-block-size: 0;
  flex-direction: column;

  > .search-field {
    display: block;
    padding: 0 20px 10px;

    > .search-input {
      block-size: 32px;
      inline-size: 100%;
      border: 1px solid var(--color-line);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      padding-inline: 10px;
      font-size: var(--text-base);
      color: var(--color-ink);

      @media (width < 48rem) {
        min-block-size: 40px;
      }
    }
  }
}
</style>
