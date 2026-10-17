<script setup lang="ts">
import * as edit from "@loopcraft/core/edit";
import { VisuallyHidden } from "reka-ui";
import { injectEditor } from "../editor/useEditor.ts";
import type { AutosaveStatus } from "../persistence/autosave.ts";
import type { Autosave } from "../persistence/useAutosave.ts";
import BaseButton from "../primitives/BaseButton.vue";
import HintTooltip from "../primitives/HintTooltip.vue";
import IconButton from "../primitives/IconButton.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import ThemeMenu from "../theme/ThemeMenu.vue";
import type { Theme } from "../theme/useTheme.ts";
import AutosaveIndicator from "./AutosaveIndicator.vue";
import BrandMark from "./BrandMark.vue";
import BrandWordmark from "./BrandWordmark.vue";
import type { DialogKind } from "./dialogs.ts";
import HistoryButtons from "./HistoryButtons.vue";
import TitleField from "./TitleField.vue";
import { mod } from "./shortcut.ts";

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

<template>
  <header class="editor-toolbar">
    <h1 class="brand-heading">
      <BrandMark />
      <BrandWordmark class="wordmark-logo" />
      <!-- ワードマークの svg に名前を付けないのは、狭い画面で隠すと見出しの名前まで消えるため -->
      <VisuallyHidden>Loopcraft</VisuallyHidden>
    </h1>
    <TitleField :title="diagram.title" :readonly="!editor.editable" @update:title="setTitle" />
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
    <HistoryButtons class="undo-redo-buttons" />
    <!-- 中くらいの幅でボタンの文字を消すのは、残すとタイトル欄が潰れ、右端のテーマの切り替えが画面からはみ出すため -->
    <HintTooltip v-if="editor.editable" text="変数の配置を自動で整える">
      <BaseButton
        class="layout-button"
        variant="ghost"
        :disabled="diagram.variables.length < 2"
        aria-label="整列"
        @click="editor.autoLayout"
      >
        <SvgIcon name="layout" />
        <span class="button-label">整列</span>
      </BaseButton>
    </HintTooltip>
    <div class="file-button-group" role="group" aria-label="ファイル">
      <template v-if="editor.editable">
        <HintTooltip text="新しい図を作る（元に戻せます）">
          <BaseButton variant="ghost" aria-label="新規" @click="editor.newDiagram">
            <SvgIcon name="file" />
            <span class="button-label">新規</span>
          </BaseButton>
        </HintTooltip>
        <HintTooltip text="JSON の貼り付け・ファイルの読み込み">
          <BaseButton
            variant="ghost"
            aria-label="読み込み"
            @click="() => emit('dialog:open', 'import')"
          >
            <SvgIcon name="open" />
            <span class="button-label">読み込み</span>
          </BaseButton>
        </HintTooltip>
      </template>
      <HintTooltip text="図全体を画像にしてコピー・保存する">
        <BaseButton
          variant="ghost"
          :disabled="diagram.variables.length === 0"
          aria-label="画像"
          @click="() => emit('dialog:open', 'screenshot')"
        >
          <SvgIcon name="image" />
          <span class="button-label">画像</span>
        </BaseButton>
      </HintTooltip>
      <HintTooltip :text="`JSON をコピー・保存（${mod}S）`">
        <BaseButton
          variant="primary"
          aria-label="JSON を書き出す"
          @click="() => emit('dialog:open', 'export')"
        >
          <SvgIcon name="save" />
          <span class="button-label">JSON を書き出す</span>
        </BaseButton>
      </HintTooltip>
    </div>
    <ThemeMenu class="theme-switcher" :theme />
    <IconButton
      class="menu-button"
      aria-label="メニュー"
      aria-haspopup="dialog"
      @click="() => emit('dialog:open', 'menu')"
    >
      <SvgIcon name="more" />
    </IconButton>
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
  padding-inline: 16px 12px;

  @media (width < 48rem) {
    gap: 4px;
    padding-inline: 12px 8px;
  }

  > .brand-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    border-inline-end: 1px solid var(--color-line);
    padding-inline-end: 12px;
    color: var(--color-ink);

    @media (width < 48rem) {
      padding-inline-end: 8px;
    }

    > .wordmark-logo {
      block-size: 16px;
      inline-size: 67px;

      @media (width < 48rem) {
        display: none;
      }
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

  /* 狭い画面で元に戻す・整列・テーマを並べないのは、同じ操作がメニューとキャンバスの下端にあるため */
  > .undo-redo-buttons {
    @media (width < 48rem) {
      display: none;
    }
  }

  > .layout-button {
    @media (width < 48rem) {
      display: none;
    }

    > .button-label {
      @media (width < 80rem) {
        display: none;
      }
    }
  }

  > .file-button-group {
    display: flex;
    align-items: center;
    gap: 4px;
    border-inline-start: 1px solid var(--color-line);
    padding-inline-start: 12px;

    @media (width < 48rem) {
      display: none;
    }

    .button-label {
      @media (width < 80rem) {
        display: none;
      }
    }
  }

  > .theme-switcher {
    @media (width < 48rem) {
      display: none;
    }
  }

  > .menu-button {
    inline-size: 44px;
    block-size: 44px;

    @media (width >= 48rem) {
      display: none;
    }
  }
}
</style>
