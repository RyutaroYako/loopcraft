<script setup lang="ts">
import { injectEditor } from "../editor/useEditor.ts";
import HintTooltip from "../primitives/HintTooltip.vue";
import IconButton from "../primitives/IconButton.vue";
import SvgIcon from "../primitives/SvgIcon.vue";

const { empty } = defineProps<{ empty: boolean }>();

const editor = injectEditor();
const viewport = editor.viewport;
</script>

<!--
  狭い画面で拡大縮小のボタンを出さないのは、ピンチで足りるため。
  空のときに出さないのは、全体表示は押せず、右上で案内の見出しと重なるため
-->
<template>
  <div
    class="zoom-controls"
    :data-empty="empty ? '' : undefined"
    role="toolbar"
    aria-label="表示倍率"
  >
    <HintTooltip text="縮小">
      <IconButton class="zoom-out-button" aria-label="縮小" @click="() => editor.zoomStep(-1)">
        <SvgIcon name="minus" />
      </IconButton>
    </HintTooltip>
    <HintTooltip text="100% で表示">
      <button
        type="button"
        class="level-button"
        :aria-label="`100% で表示（今は ${Math.round(viewport.zoom * 100)}%）`"
        @click="() => editor.zoomTo(1)"
      >
        {{ Math.round(viewport.zoom * 100) }}%
      </button>
    </HintTooltip>
    <HintTooltip text="拡大">
      <IconButton class="zoom-in-button" aria-label="拡大" @click="() => editor.zoomStep(1)">
        <SvgIcon name="plus" />
      </IconButton>
    </HintTooltip>
    <span class="divider" />
    <HintTooltip text="全体を表示">
      <IconButton
        class="fit-button"
        aria-label="全体を表示"
        :disabled="empty"
        @click="() => editor.fitView()"
      >
        <SvgIcon name="fit" />
      </IconButton>
    </HintTooltip>
  </div>
</template>

<style scoped>
.zoom-controls {
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
    &[data-empty] {
      display: none;
    }
  }

  > .zoom-out-button {
    @media (width < 48rem) {
      display: none;
    }
  }

  > .level-button {
    min-inline-size: 46px;
    block-size: 32px;
    border-radius: var(--radius-sm);
    text-align: center;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-ink-2);
    transition: background-color var(--duration-fast) var(--ease-out);

    &:hover {
      @media (hover: hover) {
        background: var(--color-surface-2);
      }
    }

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
