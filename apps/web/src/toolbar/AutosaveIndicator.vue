<script setup lang="ts">
import { computed } from "vue";
import type { AutosaveStatus } from "../persistence/autosave.ts";
import type { DocumentStore } from "../persistence/store.ts";
import HintTooltip from "../primitives/HintTooltip.vue";

const { status, unwatched, store } = defineProps<{
  status: AutosaveStatus;
  unwatched: string | undefined;
  store: DocumentStore;
}>();

const emit = defineEmits<{
  "explain:status": [status: AutosaveStatus];
  "explain:unwatched": [detail: string | undefined];
}>();

const label = computed(() => {
  if (status.kind === "failing") return "自動保存できません";
  if (status.kind === "suspended") {
    return status.reason === "disconnected" ? "接続が切れました" : "自動保存を停止中";
  }
  if (unwatched !== undefined) return "変更を見張れません";
  return store.kind === "file" ? store.label : "自動保存済み";
});
const healthy = computed(() => status.kind === "ok" && unwatched === undefined);
const tone = computed(() => (status.kind === "ok" ? "warning" : "negative"));
const savedTitle = computed(() =>
  store.kind === "file"
    ? `変更は ${store.label} に自動で保存されます`
    : "変更はこのブラウザに自動で保存されます",
);

function explain() {
  if (status.kind !== "ok") emit("explain:status", status);
  else emit("explain:unwatched", unwatched);
}
</script>

<template>
  <!-- 表示をフォーカスできるようにするのは、キーボードでも説明の吹き出しを出せるようにするため -->
  <HintTooltip v-if="healthy" :text="savedTitle">
    <span class="autosave-indicator" tabindex="0">
      <!-- accent にしないのは、橙が警告の印と同じ系統に見え、保存できているのに注意を引くため -->
      <span class="status-dot" aria-hidden="true" />
      <span class="status-label">{{ label }}</span>
    </span>
  </HintTooltip>
  <button
    v-else
    type="button"
    class="autosave-indicator"
    :data-tone="tone"
    :aria-label="`${label}。詳しく見る`"
    @click="explain"
  >
    <span class="status-dot" aria-hidden="true" />
    <span>{{ label }}</span>
  </button>
</template>

<style scoped>
.autosave-indicator {
  display: inline-flex;
  block-size: 28px;
  align-items: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  padding-inline: 10px;
  font-size: var(--text-sm);
  white-space: nowrap;
  color: var(--color-muted);

  > .status-dot {
    block-size: 7px;
    inline-size: 7px;
    border-radius: var(--radius-full);
    background: var(--color-faint);
  }

  > .status-label {
    @media (width < 48rem) {
      display: none;
    }
  }

  &[data-tone] {
    font-weight: 500;
    transition: transform var(--duration-fast) var(--ease-out);

    &:active {
      transform: translateY(1px) scale(0.98);
    }

    > .status-dot {
      animation: var(--animate-save-pulse);
    }

    &[data-tone="warning"] {
      border-color: var(--color-warning-line);
      background: var(--color-warning-soft);
      color: var(--color-warning);

      > .status-dot {
        background: var(--color-warning-dot);
      }
    }

    &[data-tone="negative"] {
      border-color: var(--color-negative-line);
      background: var(--color-negative-soft);
      color: var(--color-negative);

      > .status-dot {
        background: var(--color-negative);
      }
    }
  }
}
</style>
