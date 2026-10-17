<script setup lang="ts">
import { computed, ref } from "vue";
import { TabsContent, TabsList, TabsRoot, TabsTrigger, VisuallyHidden } from "reka-ui";
import { injectEditor } from "../editor/useEditor.ts";
import LoopList from "./LoopList.vue";
import VariableList from "./VariableList.vue";

type Tab = "loops" | "variables";

const emit = defineEmits<{ "canvas:reveal": [] }>();

const editor = injectEditor();
const tab = ref<Tab>("loops");

const tabs = computed(() => [
  { value: "loops" as const, label: "ループ", count: editor.loopEntries.value.length },
  { value: "variables" as const, label: "変数", count: editor.diagram.value.variables.length },
]);
</script>

<template>
  <!-- 隠したタブを外さないのは、絞り込みやスクロール位置が消えるため -->
  <TabsRoot v-model="tab" as="section" class="list-tabs" :unmount-on-hide="false">
    <!-- 他と同じ 20px にしないのは、タブ自体の内側の余白があり、文字が下の一覧より右にずれるため -->
    <TabsList class="tab-list" aria-label="一覧">
      <TabsTrigger v-for="item in tabs" :key="item.value" class="tab-button" :value="item.value">
        {{ item.label }}
        <span class="count-text">
          {{ item.count }}
          <VisuallyHidden>件</VisuallyHidden>
        </span>
      </TabsTrigger>
    </TabsList>
    <TabsContent value="loops" as-child>
      <LoopList :hidden="tab !== 'loops'" />
    </TabsContent>
    <TabsContent value="variables" as-child>
      <VariableList :hidden="tab !== 'variables'" @canvas:reveal="() => emit('canvas:reveal')" />
    </TabsContent>
  </TabsRoot>
</template>

<style scoped>
.list-tabs {
  display: flex;
  min-block-size: 0;
  flex-direction: column;

  @media (width < 48rem) {
    order: 1;
  }

  > .tab-list {
    display: flex;
    gap: 4px;
    padding: 12px 8px 8px;

    @media (width < 48rem) {
      padding-block-start: 0;
    }

    > .tab-button {
      display: inline-flex;
      block-size: 30px;
      align-items: center;
      gap: 6px;
      border-radius: var(--radius-sm);
      padding-inline: 12px;
      font-size: var(--text-base);
      font-weight: 500;
      color: var(--color-muted);
      transition-property: background-color, color;
      transition-duration: var(--duration-fast);
      transition-timing-function: var(--ease-out);

      @media (width < 48rem) {
        min-block-size: 40px;
      }

      &:hover {
        @media (hover: hover) {
          color: var(--color-ink);
        }
      }

      &[aria-selected="true"] {
        background: var(--color-surface-2);
        color: var(--color-ink);
      }

      > .count-text {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--color-muted);
      }
    }
  }
}
</style>
