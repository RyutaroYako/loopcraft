<script setup lang="ts">
import { injectEditor } from "../editor/useEditor.ts";
import IconButton from "../primitives/IconButton.vue";
import SvgIcon from "../primitives/SvgIcon.vue";

const { empty } = defineProps<{ empty: boolean }>();

const editor = injectEditor();
const viewport = editor.viewport;
</script>

<!--
  狭い画面で拡大縮小のボタンを出さないのは、ピンチで足りるため。全体表示は下端の操作と重ならない右上に寄せる。
  空のときに出さないのは、全体表示は押せず、右上で案内の見出しと重なるため
-->
<template>
  <div
    class="zoom-controls"
    :data-empty="empty ? '' : undefined"
    role="toolbar"
    aria-label="表示倍率"
  >
    <IconButton class="zoom-out-button" title="縮小" @click="() => editor.zoomBy(1 / 1.2)">
      <SvgIcon name="minus" />
    </IconButton>
    <span class="level-text">{{ Math.round(viewport.zoom * 100) }}%</span>
    <IconButton class="zoom-in-button" title="拡大" @click="() => editor.zoomBy(1.2)">
      <SvgIcon name="plus" />
    </IconButton>
    <span class="divider" />
    <IconButton
      class="fit-button"
      title="全体を表示"
      :disabled="empty"
      @click="() => editor.fitView()"
    >
      <SvgIcon name="fit" />
    </IconButton>
  </div>
</template>

<style scoped>
.zoom-controls {
  position: absolute;
  inset-block-end: 16px;
  inset-inline-start: 16px;
  display: flex;
  align-items: center;
  gap: 2px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  background: var(--color-glass);
  padding: 4px;
  box-shadow: var(--shadow-float);
  backdrop-filter: blur(8px);

  @media (width < 48rem) {
    inset-block: 12px auto;
    inset-inline: auto 12px;

    &[data-empty] {
      display: none;
    }
  }

  > .zoom-out-button {
    @media (width < 48rem) {
      display: none;
    }
  }

  > .level-text {
    min-inline-size: 46px;
    text-align: center;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-ink-2);

    @media (width < 48rem) {
      display: none;
    }
  }

  > .zoom-in-button {
    @media (width < 48rem) {
      display: none;
    }
  }

  > .divider {
    margin-inline: 4px;
    block-size: 18px;
    inline-size: 1px;
    background: var(--color-line);

    @media (width < 48rem) {
      display: none;
    }
  }

  > .fit-button {
    @media (width < 48rem) {
      inline-size: 40px;
      block-size: 40px;
    }
  }
}
</style>
