<script setup lang="ts">
import { computed, ref, useId, useTemplateRef } from "vue";
import { injectEditor } from "../editor/useEditor.ts";
import VisuallyHidden from "../primitives/VisuallyHidden.vue";
import LoopList from "./LoopList.vue";
import VariableList from "./VariableList.vue";

type Tab = "loops" | "variables";

const emit = defineEmits<{ "canvas:reveal": [] }>();

const editor = injectEditor();
const tab = ref<Tab>("loops");
const tabList = useTemplateRef<HTMLDivElement>("tabList");
const id = useId();
function tabId(value: Tab) {
  return `${id}-tab-${value}`;
}

function panelId(value: Tab) {
  return `${id}-panel-${value}`;
}
const tabs = computed(() => [
  { value: "loops" as const, label: "ループ", count: editor.loopEntries.value.length },
  { value: "variables" as const, label: "変数", count: editor.diagram.value.variables.length },
]);

// Tab キーでタブを巡らせないのは、WAI-ARIA のタブの作法に従うため（Tab は一覧へ進む）
function onKeyDown(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const next = tab.value === "loops" ? "variables" : "loops";
  tab.value = next;
  tabList.value?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(next))}`)?.focus();
}
</script>

<template>
  <section class="list-tabs">
    <!-- 他と同じ 20px にしないのは、タブ自体の内側の余白があり、文字が下の一覧より右にずれるため -->
    <div ref="tabList" class="tab-list" role="tablist" aria-label="一覧">
      <button
        v-for="item in tabs"
        :id="tabId(item.value)"
        :key="item.value"
        class="tab-button"
        type="button"
        role="tab"
        :aria-controls="panelId(item.value)"
        :aria-selected="tab === item.value"
        :tabindex="tab === item.value ? 0 : -1"
        @click="() => (tab = item.value)"
        @keydown="onKeyDown"
      >
        {{ item.label }}
        <span class="count-text">
          {{ item.count }}
          <VisuallyHidden>件</VisuallyHidden>
        </span>
      </button>
    </div>
    <!-- v-if で切り替えないのは、絞り込みやスクロール位置が消えるため -->
    <LoopList :id="panelId('loops')" :hidden="tab !== 'loops'" :labelled-by="tabId('loops')" />
    <VariableList
      :id="panelId('variables')"
      :hidden="tab !== 'variables'"
      :labelled-by="tabId('variables')"
      @canvas:reveal="() => emit('canvas:reveal')"
    />
  </section>
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
