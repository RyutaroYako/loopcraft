<script setup lang="ts">
import { ref } from "vue";
import {
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  VisuallyHidden,
} from "reka-ui";
import HintTooltip from "../primitives/HintTooltip.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import { THEME_OPTIONS } from "../theme/options.ts";
import type { ThemeChoice } from "../theme/theme.ts";
import type { Theme } from "../theme/useTheme.ts";
import BrandMark from "./BrandMark.vue";
import BrandWordmark from "./BrandWordmark.vue";

const { theme } = defineProps<{ theme: Theme }>();

const open = ref(false);
</script>

<template>
  <h1 class="app-menu">
    <!-- 外を塞がないのは、開いたままでもボタンを押して閉じたり、キャンバスを触ったりできるようにするため -->
    <DropdownMenuRoot v-model:open="open" :modal="false">
      <DropdownMenuTrigger as-child>
        <!-- 開いている間に出さないのは、吹き出しがメニューの項目に重なるため -->
        <HintTooltip text="テーマの切り替え" :disabled="open">
          <button type="button" class="brand-button">
            <BrandMark />
            <BrandWordmark class="wordmark-logo" />
            <!-- ワードマークの svg に名前を付けないのは、狭い画面で隠すと見出しの名前まで消えるため -->
            <VisuallyHidden>Loopcraft</VisuallyHidden>
            <SvgIcon class="chevron-icon" name="chevron-down" />
          </button>
        </HintTooltip>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <!-- 自分の div で描かせるのは、reka-ui の要素には scoped の印が付かず、スタイルが当たらないため -->
        <DropdownMenuContent as-child align="start" :side-offset="6" :collision-padding="8">
          <div class="app-menu-content">
            <DropdownMenuLabel class="theme-label">テーマ</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              class="theme-group"
              aria-label="テーマ"
              :model-value="theme.choice.value"
              @update:model-value="(value) => theme.choose(value as ThemeChoice)"
            >
              <DropdownMenuRadioItem
                v-for="option in THEME_OPTIONS"
                :key="option.value"
                class="theme-item"
                :value="option.value"
              >
                <SvgIcon :name="option.icon" />
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
  </h1>
</template>

<style scoped>
.app-menu {
  display: flex;
  border-inline-end: 1px solid var(--color-line);
  padding-inline-end: 8px;

  > .brand-button {
    display: flex;
    block-size: 40px;
    align-items: center;
    gap: 8px;
    border-radius: var(--radius-sm);
    padding-inline: 6px;
    color: var(--color-ink);
    transition: background-color var(--duration-fast) var(--ease-out);

    @media (width < 48rem) {
      block-size: 44px;
    }

    &:hover {
      @media (hover: hover) {
        background: var(--color-surface-2);
      }
    }

    &[data-state="open"] {
      background: var(--color-surface-2);
    }

    > .wordmark-logo {
      block-size: 16px;
      inline-size: 67px;

      @media (width < 48rem) {
        display: none;
      }
    }

    > .chevron-icon {
      inline-size: 14px;
      block-size: 14px;
      color: var(--color-muted);
    }
  }
}

/* .app-menu の中に入れ子にしないのは、メニューは body の直下へ移して描くため */
.app-menu-content {
  z-index: var(--z-popover);
  display: grid;
  inline-size: 220px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: 4px;
  box-shadow: var(--shadow-float);

  > .theme-label {
    padding: 6px 10px 4px;
    font-size: var(--text-sm);
    color: var(--color-muted);
  }

  > .theme-group {
    display: grid;

    > .theme-item {
      display: flex;
      block-size: 32px;
      align-items: center;
      gap: 10px;
      border-radius: var(--radius-xs);
      padding-inline: 10px;
      font-size: var(--text-base);
      color: var(--color-ink);
      cursor: default;
      outline: none;

      @media (width < 48rem) {
        block-size: 44px;
        font-size: var(--text-md);
      }

      /* フォーカスを薄い背景だけにしないのは、白地との差が小さく、キーボードではどの項目が選ばれているか読めないため */
      &[data-highlighted] {
        background: var(--color-surface-2);
      }

      &:focus-visible {
        box-shadow: var(--shadow-focus-inset);
      }

      > .check-icon {
        display: inline-flex;
        margin-inline-start: auto;
        color: var(--color-accent);
      }
    }
  }
}
</style>
