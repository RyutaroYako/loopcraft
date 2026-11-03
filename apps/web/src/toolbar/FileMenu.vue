<script setup lang="ts">
import { ref } from "vue";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "reka-ui";
import { injectEditor } from "../editor/useEditor.ts";
import HintTooltip from "../primitives/HintTooltip.vue";
import IconButton from "../primitives/IconButton.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import type { DialogKind } from "./dialogs.ts";
import { mod } from "./shortcut.ts";

const emit = defineEmits<{ "dialog:open": [kind: DialogKind] }>();

const editor = injectEditor();
const diagram = editor.diagram;
const open = ref(false);
</script>

<template>
  <div class="file-menu">
    <!-- 外を塞がないのは、開いたままでもボタンを押して閉じたり、キャンバスを触ったりできるようにするため -->
    <DropdownMenuRoot v-model:open="open" :modal="false">
      <DropdownMenuTrigger as-child>
        <!-- 開いている間に出さないのは、吹き出しがメニューの項目に重なるため -->
        <HintTooltip text="新規・読み込み・書き出し" :disabled="open">
          <IconButton class="file-menu-button" aria-label="ファイル">
            <SvgIcon name="chevron-down" />
          </IconButton>
        </HintTooltip>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <!-- 自分の div で描かせるのは、reka-ui の要素には scoped の印が付かず、スタイルが当たらないため -->
        <DropdownMenuContent as-child align="start" :side-offset="6" :collision-padding="8">
          <div class="file-menu-content">
            <template v-if="editor.editable">
              <DropdownMenuItem class="action-item" @select="editor.newDiagram">
                <SvgIcon name="file" />
                新規
              </DropdownMenuItem>
              <DropdownMenuItem class="action-item" @select="() => emit('dialog:open', 'import')">
                <SvgIcon name="open" />
                JSON を読み込む
              </DropdownMenuItem>
              <DropdownMenuSeparator class="group-divider" />
            </template>
            <DropdownMenuItem
              class="action-item"
              :disabled="diagram.variables.length === 0"
              @select="() => emit('dialog:open', 'screenshot')"
            >
              <SvgIcon name="image" />
              画像を書き出す
            </DropdownMenuItem>
            <DropdownMenuItem
              class="action-item"
              :aria-keyshortcuts="mod === '⌘' ? 'Meta+S' : 'Control+S'"
              @select="() => emit('dialog:open', 'export')"
            >
              <SvgIcon name="save" />
              JSON を書き出す
              <span class="shortcut-text" aria-hidden="true">{{ mod }}S</span>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </div>
</template>

<style scoped>
.file-menu {
  display: flex;

  > .file-menu-button {
    @media (width < 48rem) {
      inline-size: 44px;
      block-size: 44px;
    }
  }
}

/* .file-menu の中に入れ子にしないのは、メニューは body の直下へ移して描くため */
.file-menu-content {
  z-index: var(--z-popover);
  display: grid;
  inline-size: 240px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: 4px;
  box-shadow: var(--shadow-float);

  > .action-item {
    display: flex;
    block-size: 34px;
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

    &[data-disabled] {
      opacity: 0.4;
    }

    > .shortcut-text {
      margin-inline-start: auto;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      color: var(--color-muted);
    }
  }

  > .group-divider {
    margin: 4px;
    block-size: 1px;
    background: var(--color-line);
  }
}
</style>
