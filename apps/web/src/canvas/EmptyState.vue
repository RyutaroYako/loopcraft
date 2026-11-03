<script setup lang="ts">
import { useId } from "vue";
import { createSampleDiagram } from "@loopcraft/core/sample";
import { injectEditor } from "../editor/useEditor.ts";
import BaseButton from "../primitives/BaseButton.vue";
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
    <h2 :id="titleId" class="title-heading">出来事の裏にあるループを描く</h2>
    <div class="lead-area">
      <p class="lead-text">
        システム思考では、「売上が落ちた」「人が辞めた」といった出来事を単独で見ず、その裏で増えたり減ったりしているもの同士のつながりとして捉えます。
      </p>
      <p class="lead-text">
        売上や離職数のような変数を置いて矢印でつなぐと、出来事につながる因果関係のループが見えてきます。
      </p>
    </div>
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
    <h2 :id="titleId" class="title-heading">変数がありません</h2>
    <p class="lead-text">読み取り専用で開いています</p>
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

  > .lead-area {
    display: grid;
    max-inline-size: 40ch;
    gap: 8px;
    color: var(--color-ink-2);

    @media (width < 48rem) and (height <= 760px) {
      display: none;
    }

    > .lead-text {
      word-break: auto-phrase;
    }
  }

  > .lead-text {
    max-inline-size: 40ch;
    color: var(--color-ink-2);
    word-break: auto-phrase;
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
