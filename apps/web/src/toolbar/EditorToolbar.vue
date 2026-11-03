<script setup lang="ts">
import * as edit from "@loopcraft/core/edit";
import { VisuallyHidden } from "reka-ui";
import { injectEditor } from "../editor/useEditor.ts";
import type { AutosaveStatus } from "../persistence/autosave.ts";
import type { Autosave } from "../persistence/useAutosave.ts";
import HintTooltip from "../primitives/HintTooltip.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import type { Theme } from "../theme/useTheme.ts";
import AppMenu from "./AppMenu.vue";
import AutosaveIndicator from "./AutosaveIndicator.vue";
import type { DialogKind } from "./dialogs.ts";
import FileMenu from "./FileMenu.vue";
import TitleField from "./TitleField.vue";

const { readonly, theme, autosave } = defineProps<{
  readonly: boolean;
  theme: Theme;
  autosave: Autosave;
}>();

const emit = defineEmits<{
  "dialog:open": [kind: DialogKind];
  "explain:status": [status: AutosaveStatus];
  "explain:unwatched": [detail: string | undefined];
}>();

const editor = injectEditor();
const diagram = editor.diagram;

function setTitle(title: string) {
  editor.commit(edit.setTitle(editor.diagram.value, title), "title");
}
</script>

<!--
  図への操作をタイトルの横に、アプリの設定をロゴに寄せ、ツールバーに並べないのは、
  項目が増えるたびにタイトル欄が押し縮められ、狭い画面では別のメニューに逃がす必要があったため
-->
<template>
  <header class="editor-toolbar">
    <AppMenu :theme />
    <div class="title-area">
      <TitleField
        class="diagram-title-field"
        :title="diagram.title"
        :readonly="!editor.editable"
        @update:title="setTitle"
      />
      <FileMenu class="diagram-file-menu" @dialog:open="(kind) => emit('dialog:open', kind)" />
    </div>
    <!-- 印をフォーカスできるようにするのは、キーボードでも説明の吹き出しを出せるようにするため -->
    <HintTooltip v-if="readonly" text="loopcraft serve --readonly で開いています">
      <span class="readonly-badge" tabindex="0">
        <!-- 見えている文言を読ませないのは、狭い画面で印だけに縮めると読み上げまで変わるため -->
        <span class="readonly-text" aria-hidden="true">読み取り専用</span>
        <span class="lock-icon" aria-hidden="true"><SvgIcon name="lock" /></span>
        <VisuallyHidden>読み取り専用。編集も保存もできません</VisuallyHidden>
      </span>
    </HintTooltip>
    <AutosaveIndicator
      :status="autosave.status.value"
      :unwatched="autosave.unwatched.value"
      :store="autosave.store"
      @explain:status="(status) => emit('explain:status', status)"
      @explain:unwatched="(detail) => emit('explain:unwatched', detail)"
    />
  </header>
</template>

<style scoped>
.editor-toolbar {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: auto;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  border-block-end: 1px solid var(--color-line);
  background: var(--color-surface);
  padding-inline: 10px 12px;

  @media (width < 48rem) {
    gap: 4px;
    padding-inline: 8px;
  }

  > .title-area {
    display: flex;
    min-inline-size: 0;
    align-items: center;
    gap: 2px;

    > .diagram-title-field {
      flex: 0 1 auto;
    }

    > .diagram-file-menu {
      flex: none;
    }
  }

  > .readonly-badge {
    border-radius: var(--radius-full);
    background: var(--color-surface-2);
    padding: 3px 10px;
    font-size: var(--text-sm);
    font-weight: 500;
    white-space: nowrap;
    color: var(--color-ink-2);

    @media (width < 48rem) {
      display: inline-flex;
      padding: 4px 6px;
    }

    > .readonly-text {
      @media (width < 48rem) {
        display: none;
      }
    }

    > .lock-icon {
      display: inline-flex;

      @media (width >= 48rem) {
        display: none;
      }
    }
  }
}
</style>
