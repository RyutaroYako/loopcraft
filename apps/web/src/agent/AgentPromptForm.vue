<script setup lang="ts">
import type { AgentSelection } from "@loopcraft/core/agent";
import { VisuallyHidden } from "reka-ui";
import { useId, useTemplateRef } from "vue";
import BaseButton from "../primitives/BaseButton.vue";
import HintTooltip from "../primitives/HintTooltip.vue";
import IconButton from "../primitives/IconButton.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import { SELECTION_KIND_TEXT } from "./agentText.ts";

const { draft, selection, withSelection, busy, running, touched } = defineProps<{
  draft: string;
  selection: AgentSelection | undefined;
  withSelection: boolean;
  busy: boolean;
  running: boolean;
  /** AI が変えた所をキャンバスで示している */
  touched: boolean;
}>();

const emit = defineEmits<{
  "update:draft": [draft: string];
  "update:withSelection": [withSelection: boolean];
  "prompt:send": [];
  "agent:stop": [];
}>();

const input = useTemplateRef<HTMLTextAreaElement>("input");
const inputId = useId();

function onKeyDown(event: KeyboardEvent) {
  // 変換中の Enter で送らないのは、変換を確定するつもりの Enter で、書きかけの指示が送られるため。
  // 廃止予定の keyCode も見るのは、Safari では確定の Enter が変換の終わりの後に届き、isComposing が false になるため
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  emit("prompt:send");
}

defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <form class="agent-prompt-form" @submit.prevent="() => emit('prompt:send')">
    <div v-if="selection && withSelection && !busy" class="selection-area">
      <span class="selection-label">選んでいる{{ SELECTION_KIND_TEXT[selection.kind] }}</span>
      <span class="selection-badge">
        {{ selection.label }}
        <HintTooltip text="指示に含めない">
          <IconButton
            class="remove-selection-button"
            :aria-label="`${selection.label}を指示に含めない`"
            @click="() => emit('update:withSelection', false)"
          >
            <SvgIcon name="close" />
          </IconButton>
        </HintTooltip>
      </span>
    </div>
    <VisuallyHidden as-child>
      <label class="prompt-label" :for="inputId">AI への指示</label>
    </VisuallyHidden>
    <textarea
      :id="inputId"
      ref="input"
      class="prompt-input"
      :value="draft"
      :disabled="busy"
      rows="3"
      :placeholder="
        busy ? '終わるまで待つか、停止してください' : 'Enter で送る、Shift+Enter で改行'
      "
      @input="(event) => emit('update:draft', (event.currentTarget as HTMLTextAreaElement).value)"
      @keydown="onKeyDown"
    />
    <div class="action-area">
      <span v-if="touched" class="touched-legend-text">
        <span class="legend-badge" aria-hidden="true" />
        AI が変えた所
      </span>
      <BaseButton v-if="running" class="stop-button" @click="() => emit('agent:stop')">
        <SvgIcon name="stop" />
        停止
      </BaseButton>
      <BaseButton
        v-else
        class="send-button"
        type="submit"
        variant="primary"
        :disabled="busy || draft.trim() === ''"
      >
        <SvgIcon name="arrow-up" />
        送る
      </BaseButton>
    </div>
  </form>
</template>

<style scoped>
.agent-prompt-form {
  display: grid;
  gap: 8px;
  border-block-start: 1px solid var(--color-line);
  padding: 12px 16px 16px;

  > .selection-area {
    display: flex;
    align-items: center;
    gap: 6px;

    > .selection-label {
      font-size: var(--text-xs);
      color: var(--color-muted);
    }

    > .selection-badge {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      border-radius: var(--radius-full);
      box-shadow: inset 0 0 0 1px var(--color-line-strong);
      padding-inline: 9px 2px;
      font-size: var(--text-sm);
      font-weight: 500;

      > .remove-selection-button {
        inline-size: 22px;
        block-size: 22px;
        border-radius: var(--radius-full);
      }
    }
  }

  > .prompt-input {
    inline-size: 100%;
    resize: none;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
    padding: 10px 12px;
    font-size: var(--text-base);
    line-height: 1.6;
    transition: border-color var(--duration-fast) var(--ease-out);

    &:hover:not(:disabled) {
      border-color: var(--color-line-strong);
    }

    &:focus {
      outline: none;
      border-color: var(--color-accent);
      background: var(--color-surface);
    }

    &:disabled {
      color: var(--color-faint);
    }
  }

  > .action-area {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;

    > .touched-legend-text {
      display: flex;
      flex-grow: 1;
      align-items: center;
      gap: 6px;
      font-size: var(--text-xs);
      color: var(--color-muted);

      > .legend-badge {
        inline-size: 10px;
        block-size: 10px;
        border-radius: var(--radius-2xs);
        background: var(--color-accent-tint);
        box-shadow: inset 0 0 0 1.5px var(--color-accent);
      }
    }
  }
}
</style>
