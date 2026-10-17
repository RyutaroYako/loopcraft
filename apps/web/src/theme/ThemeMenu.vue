<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import IconButton from "../primitives/IconButton.vue";
import { MENU_WIDTH } from "../primitives/menu.ts";
import type { MenuItem } from "../primitives/menu.ts";
import PopupMenu from "../primitives/PopupMenu.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import { THEME_OPTIONS } from "./options.ts";
import type { Theme } from "./useTheme.ts";

const { theme } = defineProps<{ theme: Theme }>();

const menu = ref<{ x: number; y: number; bounds: { width: number; height: number } } | null>(null);
const button = useTemplateRef<InstanceType<typeof IconButton>>("button");

const current = computed(
  () => THEME_OPTIONS.find((option) => option.value === theme.choice.value) ?? THEME_OPTIONS[0]!,
);
const items = computed<MenuItem[]>(() =>
  THEME_OPTIONS.map((option) => ({
    label: option.label,
    checked: option.value === theme.choice.value,
    run: () => theme.choose(option.value),
  })),
);

const anchor = computed(() => button.value?.element ?? null);

function toggle() {
  if (menu.value) {
    menu.value = null;
    return;
  }
  const rect = anchor.value?.getBoundingClientRect();
  if (!rect) return;
  menu.value = {
    x: rect.right - MENU_WIDTH,
    y: rect.bottom + 6,
    bounds: { width: window.innerWidth, height: window.innerHeight },
  };
}

function close(restoreFocus: boolean) {
  menu.value = null;
  if (restoreFocus) anchor.value?.focus();
}
</script>

<template>
  <div class="theme-menu">
    <IconButton
      ref="button"
      :aria-label="`テーマ: ${current.label}`"
      aria-haspopup="menu"
      :aria-expanded="menu !== null"
      title="テーマを切り替える"
      @click="toggle"
    >
      <SvgIcon :name="current.icon" />
    </IconButton>
    <!-- ボタンの隣に置かないのは、PopupMenu が親の大きさを基準に、はみ出さない位置へ寄せるため -->
    <div v-if="menu" class="popup-layer">
      <PopupMenu
        label="テーマ"
        :items
        :x="menu.x"
        :y="menu.y"
        :bounds="menu.bounds"
        :anchor
        @menu:close="close"
      />
    </div>
  </div>
</template>

<style scoped>
@layer components {
  .theme-menu {
    display: flex;
  }
}

.theme-menu {
  > .popup-layer {
    position: fixed;
    inset: 0;
    z-index: var(--z-popover);
    pointer-events: none;
  }
}
</style>
