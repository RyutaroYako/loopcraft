<script setup lang="ts">
import { nextTick, useId, useTemplateRef, watch } from "vue";
import HintTooltip from "../primitives/HintTooltip.vue";
import IconButton from "../primitives/IconButton.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import AgentPromptForm from "./AgentPromptForm.vue";
import AgentTurn from "./AgentTurn.vue";
import type { Agent } from "./useAgent.ts";

const { agent } = defineProps<{ agent: Agent }>();

const emit = defineEmits<{ "panel:close": [] }>();

const EXAMPLES = [
  "選んだ変数から始まるループを足して",
  "重なっている矢印が無くなるように並べ直して",
  "README を読んで、足りない変数を挙げて",
];

const welcomeId = useId();
const log = useTemplateRef<HTMLDivElement>("log");
const form = useTemplateRef<InstanceType<typeof AgentPromptForm>>("form");

/** 読み返している途中で下へ飛ばないよう、末尾を見ているときだけ追う */
const FOLLOW_MARGIN = 48;

watch(
  () => agent.turns.value,
  async () => {
    const element = log.value;
    const following =
      !element || element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_MARGIN;
    await nextTick();
    if (following && log.value) log.value.scrollTop = log.value.scrollHeight;
  },
);

function pick(example: string) {
  agent.setDraft(example);
  form.value?.focus();
}
</script>

<template>
  <aside class="agent-panel" aria-label="AI">
    <div class="header-area">
      <h2 class="panel-heading">AI</h2>
      <span class="agent-label">
        {{ agent.info.label }}
        <span v-if="agent.info.version" class="version-text">{{ agent.info.version }}</span>
      </span>
      <HintTooltip text="新しい会話">
        <IconButton
          aria-label="新しい会話"
          :disabled="agent.busy.value || agent.turns.value.length === 0"
          @click="() => void agent.reset()"
        >
          <SvgIcon name="compose" />
        </IconButton>
      </HintTooltip>
      <HintTooltip text="閉じる">
        <IconButton aria-label="閉じる" @click="() => emit('panel:close')">
          <SvgIcon name="close" />
        </IconButton>
      </HintTooltip>
    </div>

    <section
      v-if="agent.turns.value.length === 0"
      class="welcome-area"
      :aria-labelledby="welcomeId"
    >
      <h3 :id="welcomeId" class="welcome-heading">図をどう変えますか</h3>
      <ul class="example-list" aria-label="指示の例">
        <li v-for="example in EXAMPLES" :key="example" class="example-item">
          <button type="button" class="example-button" @click="() => pick(example)">
            {{ example }}
          </button>
        </li>
      </ul>
      <p class="scope-text">
        AI はこのフォルダのファイルを読めますが、書き換えられるのはこの図だけです。
      </p>
    </section>
    <div v-else ref="log" class="turn-log" role="log" aria-label="AI とのやりとり">
      <AgentTurn
        v-for="(turn, index) in agent.turns.value"
        :key="turn.id"
        :turn
        :latest="index === agent.turns.value.length - 1"
        @turn:undo="(id) => void agent.undo(id)"
        @turn:retry="(failed) => void agent.send(failed.prompt)"
      />
    </div>

    <AgentPromptForm
      ref="form"
      :draft="agent.draft.value"
      :selection="agent.selection.value"
      :with-selection="agent.withSelection.value"
      :busy="agent.busy.value"
      :running="agent.running.value"
      :touched="agent.touched.value !== undefined"
      @update:draft="agent.setDraft"
      @update:with-selection="agent.setWithSelection"
      @prompt:send="() => void agent.send()"
      @agent:stop="() => void agent.stop()"
    />
  </aside>
</template>

<style scoped>
.agent-panel {
  display: grid;
  min-block-size: 0;
  grid-template-rows: auto minmax(0, 1fr) auto;
  border-inline-start: 1px solid var(--color-line);
  background: var(--color-surface);

  @media (width < 48rem) {
    block-size: min(60dvh, 560px);
    border-inline-start: none;
    border-block-start: 1px solid var(--color-line);
  }

  > .header-area {
    display: flex;
    align-items: center;
    gap: 8px;
    block-size: 52px;
    border-block-end: 1px solid var(--color-line);
    padding-inline: 20px 8px;

    > .panel-heading {
      font-size: var(--text-lg);
      font-weight: 600;
      letter-spacing: var(--tracking-heading);
    }

    > .agent-label {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      margin-inline-end: auto;
      font-size: var(--text-sm);
      font-weight: 500;
      color: var(--color-muted);

      > .version-text {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        font-weight: 400;
        color: var(--color-faint);
      }
    }
  }

  > .welcome-area {
    display: grid;
    align-content: start;
    gap: 16px;
    overflow-y: auto;
    padding: 24px 20px;

    > .welcome-heading {
      font-size: var(--text-xl);
      font-weight: 600;
      letter-spacing: var(--tracking-heading);
    }

    > .example-list {
      display: grid;
      gap: 6px;

      > .example-item > .example-button {
        inline-size: 100%;
        border: 1px solid var(--color-line);
        border-radius: var(--radius-md);
        padding: 10px 12px;
        text-align: start;
        font-size: var(--text-base);
        color: var(--color-ink-2);
        transition:
          border-color var(--duration-fast) var(--ease-out),
          background-color var(--duration-fast) var(--ease-out);

        &:hover {
          border-color: var(--color-line-strong);
          background: var(--color-surface-2);
        }
      }
    }

    > .scope-text {
      font-size: var(--text-sm);
      line-height: 1.7;
      color: var(--color-muted);
    }
  }

  > .turn-log {
    display: grid;
    align-content: start;
    gap: 28px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 20px;
  }
}
</style>
