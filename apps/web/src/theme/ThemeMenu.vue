<script setup lang="ts">
import { computed, ref } from "vue";
import {
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "reka-ui";
import HintTooltip from "../primitives/HintTooltip.vue";
import IconButton from "../primitives/IconButton.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import { THEME_OPTIONS } from "./options.ts";
import type { ThemeChoice } from "./theme.ts";
import type { Theme } from "./useTheme.ts";

const { theme } = defineProps<{ theme: Theme }>();

const open = ref(false);
const current = computed(
  () => THEME_OPTIONS.find((option) => option.value === theme.choice.value) ?? THEME_OPTIONS[0]!,
);
</script>

<template>
  <div class="theme-menu">
    <!-- 外を塞がないのは、開いたままでもボタンを押して閉じたり、キャンバスを触ったりできるようにするため -->
    <DropdownMenuRoot v-model:open="open" :modal="false">
      <!-- 吹き出しをメニューのボタンの外に置かないのは、reka-ui では内側の位置の基準が外側を上書きし、メニューの出る位置が狂うため -->
      <DropdownMenuTrigger as-child>
        <!-- 開いている間に出さないのは、吹き出しがメニューの項目に重なるため -->
        <HintTooltip text="テーマを切り替える" :disabled="open">
          <IconButton :aria-label="`テーマ: ${current.label}`">
            <SvgIcon :name="current.icon" />
          </IconButton>
        </HintTooltip>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <!-- 自分の div で描かせるのは、reka-ui の要素には scoped の印が付かず、スタイルが当たらないため -->
        <DropdownMenuContent as-child align="end" :side-offset="6" :collision-padding="8">
          <div class="theme-menu-content">
            <DropdownMenuRadioGroup
              class="theme-group"
              :model-value="theme.choice.value"
              @update:model-value="(value) => theme.choose(value as ThemeChoice)"
            >
              <DropdownMenuRadioItem
                v-for="option in THEME_OPTIONS"
                :key="option.value"
                class="theme-item"
                :value="option.value"
              >
                <span class="item-label">{{ option.label }}</span>
                <DropdownMenuItemIndicator class="check-icon">
                  <SvgIcon name="check" />
                </DropdownMenuItemIndicator>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </div>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </div>
</template>

<style scoped>
@layer components {
  .theme-menu {
    display: flex;
  }
}

/* .theme-menu の中に入れ子にしないのは、メニューは body の直下へ移して描くため */
.theme-menu-content {
  z-index: var(--z-popover);
  display: grid;
  inline-size: 220px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: 4px;
  box-shadow: var(--shadow-float);

  > .theme-group {
    display: grid;

    > .theme-item {
      display: flex;
      block-size: 32px;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-radius: var(--radius-xs);
      padding-inline: 10px;
      font-size: var(--text-base);
      color: var(--color-ink);
      cursor: default;
      outline: none;

      /* フォーカスを薄い背景だけにしないのは、白地との差が小さく、キーボードではどの項目が選ばれているか読めないため */
      &[data-highlighted] {
        background: var(--color-surface-2);
      }

      &:focus-visible {
        box-shadow: var(--shadow-focus-inset);
      }

      > .check-icon {
        display: inline-flex;
        color: var(--color-accent);
      }
    }
  }
}
</style>
