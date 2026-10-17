<script setup lang="ts">
import { computed } from "vue";
import { VisuallyHidden } from "reka-ui";
import type { LoopEntry } from "@loopcraft/core/loops";
import { UNNAMED } from "../editor/boxes.ts";
import { injectEditor } from "../editor/useEditor.ts";
import HintTooltip from "../primitives/HintTooltip.vue";
import IconButton from "../primitives/IconButton.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import ListRow from "./ListRow.vue";
import { kindLabel } from "./loopText.ts";

const { entry, index } = defineProps<{ entry: LoopEntry; index: number }>();

const editor = injectEditor();

const labels = computed(() =>
  entry.variables.map((id) => editor.variableById.value.get(id)?.label || UNNAMED),
);
const active = computed(() => editor.highlightedLoop.value?.key === entry.key);
const featured = computed(() => entry.featured !== undefined);

function choose() {
  if (entry.featured) {
    editor.select({ kind: "loop", id: entry.featured.loop.id });
    return;
  }
  editor.select(null);
  editor.setFocusedLoop(editor.focusedLoop.value === entry.key ? null : entry.key);
}

function togglePin() {
  if (entry.featured) editor.unfeatureLoop(entry.featured.loop.id);
  else editor.featureLoop(entry.links);
}
</script>

<template>
  <ListRow
    class="loop-list-item"
    :active
    :index
    :muted="!featured"
    :data-loop-key="entry.key"
    :data-kind="entry.kind"
    @click:row="choose"
    @pointerenter="() => editor.setHoveredLoop(entry.key)"
    @pointerleave="() => editor.setHoveredLoop(null)"
  >
    <template #leading>
      <span
        class="loop-badge"
        :data-kind="entry.kind"
        :data-featured="featured ? '' : undefined"
        :data-active="active ? '' : undefined"
      >
        {{ entry.featured?.badge ?? (entry.kind === "reinforcing" ? "R" : "B") }}
      </span>
    </template>
    <template #title>{{ entry.featured?.loop.name || kindLabel(entry.kind) }}</template>
    <template #route>{{ labels.join(" → ") }}</template>
    <template #trailing>
      <HintTooltip text="ループを構成する関連の数">
        <span class="link-count-text">
          <VisuallyHidden>関連</VisuallyHidden>
          {{ entry.links.length }}
          <VisuallyHidden>本</VisuallyHidden>
        </span>
      </HintTooltip>
    </template>
    <template #after>
      <HintTooltip :text="featured ? '見出しを外す' : 'このループを見出す'">
        <IconButton
          class="pin-button"
          :data-featured="featured ? '' : undefined"
          :aria-pressed="featured"
          :aria-label="featured ? '見出しを外す' : 'このループを見出す'"
          :disabled="!editor.editable"
          @click="togglePin"
        >
          <SvgIcon :name="featured ? 'pin-filled' : 'pin'" />
        </IconButton>
      </HintTooltip>
    </template>
  </ListRow>
</template>

<style scoped>
.loop-list-item {
  .loop-badge {
    display: grid;
    block-size: 30px;
    inline-size: 30px;
    place-items: center;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 600;

    /* 文字を accent にしないのは、薄い橙の地では 4.5:1 に届かないため */
    &[data-kind="reinforcing"] {
      background: var(--color-accent-soft);
      color: var(--color-accent-strong);
    }

    &[data-kind="balancing"] {
      background: var(--color-surface-2);
      color: var(--color-ink-2);
    }

    &[data-featured] {
      color: var(--color-on-strong);

      &[data-kind="reinforcing"] {
        background: var(--color-accent);
      }

      &[data-kind="balancing"] {
        background: var(--color-ink-2);
      }
    }

    &[data-active] {
      box-shadow: var(--shadow-edge-inset);
    }
  }

  &:hover .loop-badge {
    @media (hover: hover) {
      box-shadow: var(--shadow-edge-inset);
    }
  }

  .link-count-text {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-faint);
  }

  .pin-button {
    margin-inline-end: 6px;
    color: var(--color-faint);

    &[data-featured] {
      color: var(--color-accent);
    }

    &:enabled:hover {
      @media (hover: hover) {
        color: var(--color-ink);
      }
    }
  }
}
</style>
