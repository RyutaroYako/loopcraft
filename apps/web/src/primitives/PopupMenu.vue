<script setup lang="ts">
import { computed, onMounted, onUnmounted, useTemplateRef } from "vue";
import { MENU_WIDTH } from "./menu.ts";
import type { MenuItem } from "./menu.ts";
import SvgIcon from "./SvgIcon.vue";

const ITEM_HEIGHT = 34;
const NAVIGATION_KEYS = ["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Tab"];

const { label, items, x, y, bounds, anchor } = defineProps<{
  label: string;
  items: readonly MenuItem[];
  x: number;
  y: number;
  bounds: { width: number; height: number };
  /** ここを押しても閉じないのは、開いたボタン自身が開け閉めを切り替えるため */
  anchor?: Element | null;
}>();

const emit = defineEmits<{ "menu:close": [restoreFocus: boolean] }>();

const menu = useTemplateRef<HTMLDivElement>("menu");

const position = computed(() => ({
  "--menu-x": `${Math.max(8, Math.min(x, bounds.width - MENU_WIDTH - 8))}px`,
  "--menu-y": `${Math.max(8, Math.min(y, bounds.height - items.length * ITEM_HEIGHT - 16))}px`,
}));

function buttons() {
  return [...(menu.value?.querySelectorAll<HTMLButtonElement>("button:enabled") ?? [])];
}

function move(step: number) {
  const list = buttons();
  if (list.length === 0) return;
  const index = list.indexOf(document.activeElement as HTMLButtonElement);
  list[(index + step + list.length) % list.length]!.focus();
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node;
  if (menu.value && !menu.value.contains(target) && !anchor?.contains(target))
    emit("menu:close", false);
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  buttons()[0]?.focus();
});

onUnmounted(() => document.removeEventListener("pointerdown", onDocumentPointerDown, true));

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "ArrowDown") move(1);
  else if (event.key === "ArrowUp") move(-1);
  else if (event.key === "Home") buttons()[0]?.focus();
  else if (event.key === "End") buttons().at(-1)?.focus();
  else if (event.key === "Escape") emit("menu:close", true);
  // Tab を既定の動きに任せないのは、消えたボタンの位置から無関係な所へ移るため
  else if (event.key === "Tab") emit("menu:close", true);
  // 伝播を止めないと、Delete や元に戻すが window のショートカットに届いて図が変わる
  event.stopPropagation();
  if (NAVIGATION_KEYS.includes(event.key)) event.preventDefault();
}

// run の後で戻さないのは、消える操作では戻し先が既に無いため
function choose(item: MenuItem) {
  emit("menu:close", true);
  item.run();
}

// hover だけで光らせないのは、キーボードのフォーカスと 2 つ同時に光るため
function focusUnderPointer(event: PointerEvent) {
  (event.currentTarget as HTMLButtonElement).focus();
}
</script>

<template>
  <div ref="menu" class="popup-menu" role="menu" :aria-label="label" :style="position">
    <button
      v-for="item in items"
      :key="item.label"
      class="item-button"
      type="button"
      :role="item.checked === undefined ? 'menuitem' : 'menuitemradio'"
      :aria-checked="item.checked === undefined ? undefined : item.checked"
      @pointermove="focusUnderPointer"
      @click="() => choose(item)"
      @keydown="onKeyDown"
      @contextmenu.prevent
    >
      <span class="item-label">{{ item.label }}</span>
      <span v-if="item.checked" class="check-icon" aria-hidden="true"
        ><SvgIcon name="check"
      /></span>
    </button>
  </div>
</template>

<style scoped>
@layer components {
  .popup-menu {
    position: absolute;
    inset-block-start: var(--menu-y);
    inset-inline-start: var(--menu-x);
    z-index: var(--z-overlay);
    display: grid;
    inline-size: 220px;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    padding: 4px;
    box-shadow: var(--shadow-float);
    pointer-events: auto;

    /* フォーカスを薄い背景だけにしないのは、白地との差が小さく、キーボードではどの項目が選ばれているか読めないため */
    > .item-button {
      display: flex;
      block-size: 32px;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-radius: var(--radius-xs);
      padding-inline: 10px;
      text-align: start;
      font-size: var(--text-base);
      color: var(--color-ink);

      &:focus {
        background: var(--color-surface-2);
        outline: none;
      }

      &:focus-visible {
        box-shadow: var(--shadow-focus-inset);
      }

      > .check-icon {
        color: var(--color-accent);
      }
    }
  }
}
</style>
