<script setup lang="ts">
import { onMounted, useSlots, useTemplateRef } from "vue";
import IconButton from "./IconButton.vue";
import SvgIcon from "./SvgIcon.vue";

const {
  title,
  size = "medium",
  layout = "default",
} = defineProps<{
  title: string;
  size?: "small" | "medium" | "large";
  layout?: "default" | "menu";
}>();

const emit = defineEmits<{ "dialog:close": [] }>();

// 自動で引き継がせないのは、テンプレートの先頭のコメントで根が複数ある扱いになり、使う側の class が dialog に届かないため
defineOptions({ inheritAttrs: false });

defineSlots<{
  default: () => unknown;
  footer: () => unknown;
  "footer-start"?: () => unknown;
}>();

const slots = useSlots();
const dialog = useTemplateRef<HTMLDialogElement>("dialog");

onMounted(() => {
  dialog.value?.showModal();
});

/** 使う側が close イベントを自分で送らないのは、close() で閉じれば dialog の close イベントとして届くため */
function close() {
  dialog.value?.close();
}

defineExpose({ close });

// 座標で枠の外かを測らないのは、背景のクリックは dialog 自身に当たるため
function onClick(event: MouseEvent) {
  if (event.target === event.currentTarget) close();
}
</script>

<template>
  <!-- 背景のクリックにキーボードの代わりを付けないのは、dialog は Escape で閉じられるため -->
  <!-- eslint-disable-next-line a11y/click-events-have-key-events -->
  <dialog
    v-bind="$attrs"
    ref="dialog"
    class="modal-dialog"
    :data-size="size"
    :data-layout="layout"
    :aria-label="title"
    @close="() => emit('dialog:close')"
    @click="onClick"
  >
    <!-- header と footer にしないのは、dialog は区分コンテンツでなく、ページ全体のバナーや末尾と同じ役割に数えられるため -->
    <div class="dialog-head">
      <h2 class="title-heading">{{ title }}</h2>
      <IconButton aria-label="閉じる" @click="close">
        <SvgIcon name="close" />
      </IconButton>
    </div>
    <div class="dialog-body">
      <slot />
    </div>
    <div class="dialog-foot">
      <template v-if="slots['footer-start']">
        <slot name="footer-start" />
        <span class="footer-spacer" />
      </template>
      <slot name="footer" />
    </div>
  </dialog>
</template>

<style scoped>
@layer components {
  .modal-dialog {
    margin: auto;
    inline-size: min(640px, calc(100vw - 32px));
    max-block-size: calc(100dvh - 64px);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-xl);
    background: var(--color-surface);
    color: var(--color-ink);
    box-shadow: var(--shadow-float);

    &[open] {
      display: flex;
      flex-direction: column;
      animation: var(--animate-dialog-in);
    }

    &::backdrop {
      background: var(--color-scrim);
      animation: var(--animate-backdrop-in);
    }

    &[data-size="small"] {
      inline-size: min(420px, calc(100vw - 32px));
    }

    &[data-size="large"] {
      inline-size: min(960px, calc(100vw - 32px));
    }

    > .dialog-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-block: 12px 4px;
      padding-inline: 20px 12px;

      > .title-heading {
        font-size: var(--text-lg);
        font-weight: 600;
        letter-spacing: var(--tracking-heading);
      }
    }

    > .dialog-body {
      display: grid;
      min-block-size: 0;
      overflow: auto;
      gap: 12px;
      padding: 8px 20px 16px;
    }

    > .dialog-foot {
      display: flex;
      align-items: center;
      gap: 8px;
      border-block-start: 1px solid var(--color-line);
      padding: 12px 20px 16px;

      > .footer-spacer {
        flex: 1;
      }
    }

    &[data-layout="menu"] {
      > .dialog-body {
        gap: 0;
        padding: 4px 8px 8px;
      }

      /* 画面の中央に出さないのは、狭い画面では上の方の項目に親指が届かないため */
      @media (width < 48rem) {
        margin: auto 0 0;
        inline-size: 100%;
        max-inline-size: none;
        border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
        padding-block-end: env(safe-area-inset-bottom);
      }
    }
  }
}
</style>
