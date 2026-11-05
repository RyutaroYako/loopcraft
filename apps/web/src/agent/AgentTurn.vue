<script setup lang="ts">
import type { Turn } from "@loopcraft/core/agent";
import { computed } from "vue";
import BaseButton from "../primitives/BaseButton.vue";
import PolarityGlyph from "../primitives/PolarityGlyph.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import { ACTIVITY_TEXT, blocksOf, elapsedText, SELECTION_KIND_TEXT } from "./agentText.ts";

const { turn, latest } = defineProps<{ turn: Turn; latest: boolean }>();

const emit = defineEmits<{
  "turn:undo": [id: string];
  "turn:retry": [turn: Turn];
}>();

const blocks = computed(() => blocksOf(turn.items));
const elapsed = computed(() => elapsedText(turn));
</script>

<template>
  <article class="agent-turn" :aria-label="turn.prompt">
    <div class="prompt-area">
      <p class="prompt-text">{{ turn.prompt }}</p>
      <div v-if="turn.selection" class="selection-area">
        <span class="selection-label"
          >選んでいた{{ SELECTION_KIND_TEXT[turn.selection.kind] }}</span
        >
        <span class="selection-badge">{{ turn.selection.label }}</span>
      </div>
    </div>

    <template v-for="block in blocks" :key="block.key">
      <p v-if="block.kind === 'text'" class="reply-text">{{ block.text }}</p>
      <ul v-else class="step-list" aria-label="AI がしたこと">
        <li v-for="row in block.rows" :key="row.key" class="step-item">
          <span class="action-text">{{ row.action }}</span>
          <span v-if="row.kind === 'variable'" class="target-area">
            <span class="variable-badge">{{ row.label }}</span>
          </span>
          <span v-else-if="row.kind === 'rename'" class="target-area">
            {{ row.before }} → {{ row.after }}
          </span>
          <span v-else-if="row.kind === 'link'" class="target-area">
            {{ row.from }} → {{ row.to }}
            <PolarityGlyph :polarity="row.polarity" />
          </span>
          <span v-else class="target-area">{{ row.text }}</span>
        </li>
      </ul>
    </template>

    <p v-if="turn.status === 'running' && turn.activity" class="activity-text">
      <span class="activity-badge" aria-hidden="true" />
      {{ ACTIVITY_TEXT[turn.activity] }}
    </p>

    <div v-if="turn.status === 'failed'" class="error-area">
      <p class="error-heading">AI の実行に失敗しました</p>
      <p v-if="turn.error" class="error-text">{{ turn.error }}</p>
    </div>

    <div v-if="turn.status !== 'running'" class="result-area">
      <BaseButton
        v-if="turn.status === 'failed' && latest"
        size="small"
        @click="() => emit('turn:retry', turn)"
      >
        もう一度送る
      </BaseButton>
      <BaseButton
        v-if="turn.undoable"
        size="small"
        variant="ghost"
        @click="() => emit('turn:undo', turn.id)"
      >
        <SvgIcon name="undo" />
        この指示の変更を取り消す
      </BaseButton>
      <span v-if="turn.undone" class="status-text">取り消しました</span>
      <span v-else-if="turn.status === 'stopped'" class="status-text">停止しました</span>
      <span v-if="elapsed" class="elapsed-text">{{ elapsed }}</span>
    </div>
  </article>
</template>

<style scoped>
.agent-turn {
  display: grid;
  gap: 12px;

  > .prompt-area {
    display: grid;
    gap: 8px;
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
    padding: 12px 14px;

    > .prompt-text {
      font-size: var(--text-base);
      line-height: 1.7;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: var(--color-ink);
    }

    > .selection-area {
      display: flex;
      align-items: center;
      gap: 6px;

      > .selection-label {
        font-size: var(--text-xs);
        color: var(--color-muted);
      }

      > .selection-badge {
        border-radius: var(--radius-full);
        background: var(--color-surface);
        box-shadow: inset 0 0 0 1px var(--color-line-strong);
        padding: 2px 9px;
        font-size: var(--text-sm);
        font-weight: 500;
      }
    }
  }

  > .reply-text {
    font-size: var(--text-base);
    line-height: 1.75;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--color-ink-2);
  }

  > .step-list {
    display: grid;

    > .step-item {
      display: grid;
      grid-template-columns: 88px minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      min-block-size: 34px;
      border-block-start: 1px solid var(--color-line);
      padding-block: 6px;

      &:last-child {
        border-block-end: 1px solid var(--color-line);
      }

      > .action-text {
        font-size: var(--text-sm);
        color: var(--color-muted);
      }

      > .target-area {
        display: flex;
        min-inline-size: 0;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        font-size: var(--text-sm);
        overflow-wrap: anywhere;
        color: var(--color-ink);

        > .variable-badge {
          border-radius: var(--radius-full);
          background: var(--color-accent-tint);
          box-shadow: inset 0 0 0 1px var(--color-accent);
          padding: 2px 9px;
          font-weight: 500;
        }
      }
    }
  }

  > .activity-text {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-sm);
    color: var(--color-muted);

    > .activity-badge {
      inline-size: 7px;
      block-size: 7px;
      border-radius: var(--radius-full);
      background: var(--color-accent);
      animation: var(--animate-save-pulse);
    }
  }

  > .error-area {
    display: grid;
    gap: 4px;
    border-radius: var(--radius-md);
    background: var(--color-negative-tint);
    box-shadow: inset 0 0 0 1px var(--color-negative-line);
    padding: 10px 12px;

    > .error-heading {
      font-size: var(--text-base);
      font-weight: 600;
      color: var(--color-negative);
    }

    > .error-text {
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      overflow-wrap: anywhere;
      color: var(--color-ink-2);
    }
  }

  > .result-area {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;

    > .status-text {
      font-size: var(--text-sm);
      color: var(--color-muted);
    }

    > .elapsed-text {
      margin-inline-start: auto;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--color-faint);
    }
  }
}
</style>
