<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from "reka-ui";

const { text, disabled = false } = defineProps<{ text: string; disabled?: boolean }>();

defineSlots<{ default: () => unknown }>();

// 自動で引き継がせないのは、根の TooltipRoot は要素を描かず、DropdownMenuTrigger などから渡る属性がボタンに届かないため
defineOptions({ inheritAttrs: false });
</script>

<!-- title 属性で済ませないのは、キーボードでフォーカスしたときに出ないため -->
<template>
  <TooltipRoot :disabled>
    <TooltipTrigger v-bind="$attrs" as-child>
      <slot />
    </TooltipTrigger>
    <TooltipPortal>
      <!-- 自分の div で描かせるのは、reka-ui の要素には scoped の印が付かず、スタイルが当たらないため -->
      <TooltipContent as-child :side-offset="6" :collision-padding="8">
        <div class="hint-tooltip">{{ text }}</div>
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>

<style scoped>
.hint-tooltip {
  z-index: var(--z-popover);
  max-inline-size: 280px;
  border-radius: var(--radius-sm);
  background: var(--color-ink);
  padding-block: 5px;
  padding-inline: 8px;
  font-size: var(--text-sm);
  line-height: 1.4;
  color: var(--color-on-strong);
  box-shadow: var(--shadow-float);
}
</style>
