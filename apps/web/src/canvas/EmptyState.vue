<script setup lang="ts">
import { useId } from "vue";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { injectEditor } from "../editor/useEditor.ts";
import BaseButton from "../primitives/BaseButton.vue";
import EyebrowLabel from "../primitives/EyebrowLabel.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import { pickJsonFile } from "../transfer/file.ts";

const editor = injectEditor();
const titleId = useId();

async function open() {
  const file = await pickJsonFile();
  if (file) await editor.importFile(file);
}

function addVariable() {
  editor.addVariableAt(editor.viewCenter());
}

function openSample() {
  editor.replaceDiagram(createSampleDiagram());
}
</script>

<!--
  案内全体で押下を受け取らないのは、案内の上でもダブルクリックで変数を足せるようにするため。
  狭い画面で広い画面と同じ余白にしないのは、ボタンが下の拡大縮小の操作と重なるため
-->
<template>
  <section v-if="editor.editable" class="empty-state" :aria-labelledby="titleId">
    <EyebrowLabel>Causal Loop Diagram</EyebrowLabel>
    <h2 :id="titleId" class="title-heading">最初の変数を置いて、つながりを描きはじめる</h2>
    <p class="lead-text">変数は、売上や社員数のように増えたり減ったりするものです</p>
    <ol class="step-list">
      <li class="step-item">
        <span class="step-number">01</span>
        <span class="step-text"
          >下の<strong class="step-keyword">「変数を追加」</strong>で変数を置く</span
        >
      </li>
      <li class="step-item">
        <span class="step-number">02</span>
        <span class="step-text"
          >変数の<strong class="step-keyword">端の点をドラッグ</strong>して、因果の矢印を引く</span
        >
      </li>
      <li class="step-item">
        <span class="step-number">03</span>
        <span class="step-text"
          >矢印が輪になると<strong class="step-keyword">ループを自動で検出</strong
          >。主張したいものを見出す</span
        >
      </li>
    </ol>
    <div class="start-buttons">
      <BaseButton class="add-variable-button" variant="primary" @click="addVariable">
        <SvgIcon name="plus" />
        変数を追加
      </BaseButton>
      <BaseButton class="sample-button" @click="openSample">
        <SvgIcon name="spark" />
        サンプルを開く
      </BaseButton>
      <BaseButton class="import-button" variant="ghost" @click="open">
        <SvgIcon name="open" />
        JSON を読み込む
      </BaseButton>
    </div>
  </section>
  <section v-else class="empty-state" :aria-labelledby="titleId">
    <EyebrowLabel>Causal Loop Diagram</EyebrowLabel>
    <h2 :id="titleId" class="title-heading">まだ変数がありません</h2>
    <p class="lead-text">
      読み取り専用で開いています。編集するには<code class="option-code">--readonly</code
      >を付けずに開き直してください。
    </p>
  </section>
</template>

<style scoped>
.empty-state {
  position: absolute;
  inset-block-start: clamp(32px, 14%, 140px);
  inset-inline-start: clamp(24px, 9%, 120px);
  display: grid;
  max-inline-size: 520px;
  gap: 24px;
  padding-block: 28px;
  padding-inline-end: 32px;
  background: radial-gradient(closest-side, var(--color-canvas) 70%, transparent);
  pointer-events: none;
  animation: var(--animate-rise);

  @media (width < 48rem) {
    inset-block-start: 16px;
    gap: 14px;
    padding-block: 12px;
  }

  > .title-heading {
    max-inline-size: 19ch;
    font-size: var(--text-display);
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: var(--tracking-display);
    text-wrap: balance;
    word-break: auto-phrase;
  }

  > .lead-text {
    max-inline-size: 40ch;
    color: var(--color-ink-2);
    word-break: auto-phrase;

    @media (width < 48rem) and (height <= 760px) {
      display: none;
    }

    > .option-code {
      margin-inline: 0.25em;
      font-family: var(--font-mono);
      white-space: nowrap;
    }
  }

  > .step-list {
    display: grid;
    gap: 10px;
    border-block: 1px solid var(--color-line);
    padding-block: 14px;
    color: var(--color-ink-2);

    @media (width < 48rem) and (height <= 760px) {
      display: none;
    }

    > .step-item {
      display: grid;
      grid-template-columns: 32px 1fr;
      align-items: baseline;
      animation: var(--animate-rise);

      &:nth-child(2) {
        animation-delay: 80ms;
      }

      &:nth-child(3) {
        animation-delay: 160ms;
      }

      > .step-number {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
        color: var(--color-accent);
      }

      > .step-text {
        > .step-keyword {
          font-weight: 600;
          color: var(--color-ink);
        }
      }
    }
  }

  > .start-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    > .add-variable-button,
    > .sample-button,
    > .import-button {
      pointer-events: auto;
    }
  }
}
</style>
