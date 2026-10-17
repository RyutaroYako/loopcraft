<script setup lang="ts">
import { useId, useTemplateRef } from "vue";
import { injectEditor } from "../editor/useEditor.ts";
import BaseButton from "../primitives/BaseButton.vue";
import ModalDialog from "../primitives/ModalDialog.vue";
import SegmentedControl from "../primitives/SegmentedControl.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import { THEME_OPTIONS } from "../theme/options.ts";
import type { Theme } from "../theme/useTheme.ts";
import type { DialogKind } from "./dialogs.ts";

const { theme } = defineProps<{ theme: Theme }>();

const emit = defineEmits<{
  "dialog:open": [kind: Exclude<DialogKind, "menu">];
  "dialog:close": [];
}>();

const editor = injectEditor();
const diagram = editor.diagram;
const dialog = useTemplateRef<InstanceType<typeof ModalDialog>>("dialog");
const themeLabelId = useId();
const themeOptions = THEME_OPTIONS.map((option) => ({
  value: option.value,
  label: option.shortLabel,
}));

function run(action: () => void) {
  dialog.value?.close();
  action();
}

function iconOf(value: string) {
  return THEME_OPTIONS.find((option) => option.value === value)?.icon ?? "monitor";
}
</script>

<!-- 狭い画面でツールバーに並べないのは、タイトルが読めないほど押し縮められるため -->
<template>
  <ModalDialog
    ref="dialog"
    class="menu-dialog"
    title="メニュー"
    size="small"
    layout="menu"
    @dialog:close="() => emit('dialog:close')"
  >
    <ul class="action-list">
      <template v-if="editor.editable">
        <li class="action-item">
          <button
            type="button"
            class="action-button"
            :disabled="diagram.variables.length < 2"
            @click="() => run(editor.autoLayout)"
          >
            <SvgIcon name="layout" />
            整列
            <span class="note-text">元に戻せます</span>
          </button>
        </li>
        <li class="action-item">
          <button type="button" class="action-button" @click="() => run(editor.newDiagram)">
            <SvgIcon name="file" />
            新規
            <span class="note-text">元に戻せます</span>
          </button>
        </li>
        <li class="action-item">
          <button type="button" class="action-button" @click="() => emit('dialog:open', 'import')">
            <SvgIcon name="open" />
            読み込み
            <span class="note-text">JSON・ファイル</span>
          </button>
        </li>
      </template>
      <li class="action-item">
        <button
          type="button"
          class="action-button"
          :disabled="diagram.variables.length === 0"
          @click="() => emit('dialog:open', 'screenshot')"
        >
          <SvgIcon name="image" />
          画像
          <span class="note-text">PNG でコピー・保存</span>
        </button>
      </li>
    </ul>
    <div class="theme-group" role="group" :aria-labelledby="themeLabelId">
      <span :id="themeLabelId" class="theme-label">テーマ</span>
      <!-- 押しても閉じないのは、切り替わった見た目をその場で確かめられるようにするため -->
      <SegmentedControl
        :options="themeOptions"
        :value="theme.choice.value"
        size="large"
        @update:value="theme.choose"
      >
        <template #icon="{ value }">
          <SvgIcon :name="iconOf(value)" />
        </template>
      </SegmentedControl>
    </div>
    <template #footer>
      <BaseButton
        class="export-button"
        variant="primary"
        @click="() => emit('dialog:open', 'export')"
      >
        <SvgIcon name="save" />
        JSON を書き出す
      </BaseButton>
    </template>
  </ModalDialog>
</template>

<style scoped>
.menu-dialog {
  .action-list {
    > .action-item {
      > .action-button {
        display: flex;
        inline-size: 100%;
        min-block-size: 52px;
        align-items: center;
        gap: 14px;
        border-radius: var(--radius-md);
        padding-inline: 12px;
        text-align: start;
        font-size: var(--text-lg);

        &:enabled:hover {
          @media (hover: hover) {
            background: var(--color-surface-2);
          }
        }

        &:disabled {
          cursor: default;
          opacity: 0.4;
        }

        > .note-text {
          margin-inline-start: auto;
          font-size: var(--text-sm);
          color: var(--color-muted);
        }
      }
    }
  }

  .theme-group {
    display: grid;
    gap: 8px;
    margin-block-start: 8px;
    border-block-start: 1px solid var(--color-line);
    padding: 16px 12px 8px;

    > .theme-label {
      font-size: var(--text-sm);
      color: var(--color-muted);
    }
  }

  .export-button {
    flex: 1;
    block-size: 48px;
    font-size: var(--text-lg);
  }
}
</style>
