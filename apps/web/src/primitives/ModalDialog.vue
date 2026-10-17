<script setup lang="ts">
import { ref, useId, useSlots, useTemplateRef } from "vue";
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
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

// 自動で引き継がせないのは、根の DialogRoot は要素を描かず、使う側の class が中身の要素に届かないため
defineOptions({ inheritAttrs: false });

defineSlots<{
  default: () => unknown;
  footer: () => unknown;
  "footer-start"?: () => unknown;
}>();

const slots = useSlots();
const open = ref(true);
const content = useTemplateRef<HTMLDivElement>("content");
// reka-ui に任せないのは、開くボタンを DialogTrigger で作らないと、空の id が付くため
const id = useId();

function close() {
  open.value = false;
  emit("dialog:close");
}

function onOpenChange(next: boolean) {
  if (!next) close();
}

// 先頭のボタンへ移さないのは、すぐ打ち込む入力欄があるダイアログでは、閉じるボタンに止まると一手余計にかかるため
function onOpenAutoFocus(event: Event) {
  const target = content.value?.querySelector<HTMLElement>("[data-autofocus]");
  if (!target) return;
  event.preventDefault();
  target.focus();
}

defineExpose({ close });
</script>

<template>
  <DialogRoot :open @update:open="onOpenChange">
    <DialogPortal>
      <!-- 自分の div で描かせるのは、reka-ui の要素には scoped の印が付かず、スタイルが当たらないため -->
      <DialogOverlay as-child>
        <div class="dialog-overlay" />
      </DialogOverlay>
      <!-- 説明の要素を結び付けないのは、本文がフォームや一覧で、まとめて読み上げる一文が無いため -->
      <DialogContent :id as-child :aria-describedby="undefined" @open-auto-focus="onOpenAutoFocus">
        <div
          v-bind="$attrs"
          ref="content"
          class="modal-dialog"
          :data-size="size"
          :data-layout="layout"
        >
          <!-- header と footer にしないのは、ダイアログは区分コンテンツでなく、ページ全体のバナーや末尾と同じ役割に数えられるため -->
          <div class="dialog-head">
            <DialogTitle as-child>
              <h2 class="title-heading">{{ title }}</h2>
            </DialogTitle>
            <DialogClose as-child>
              <IconButton aria-label="閉じる">
                <SvgIcon name="close" />
              </IconButton>
            </DialogClose>
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
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
/* 入れ子にせず 2 つを並べて書くのは、背景と本体を body の直下へ別々に移して描くため */
@layer components {
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    background: var(--color-scrim);
    animation: var(--animate-backdrop-in);
  }

  .modal-dialog {
    position: fixed;
    inset: 0;
    z-index: var(--z-dialog);
    display: flex;
    flex-direction: column;
    margin: auto;
    inline-size: min(640px, calc(100vw - 32px));
    block-size: fit-content;
    max-block-size: calc(100dvh - 64px);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-xl);
    background: var(--color-surface);
    color: var(--color-ink);
    box-shadow: var(--shadow-float);
    animation: var(--animate-dialog-in);

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
