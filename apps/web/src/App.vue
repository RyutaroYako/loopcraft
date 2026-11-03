<script setup lang="ts">
import { onErrorCaptured, onMounted, onUnmounted, provide, ref, useTemplateRef } from "vue";
import { ToastProvider, ToastViewport, TooltipProvider } from "reka-ui";
import AgentBanner from "./agent/AgentBanner.vue";
import AgentPanel from "./agent/AgentPanel.vue";
import AgentToggle from "./agent/AgentToggle.vue";
import { useAgent } from "./agent/useAgent.ts";
import DiagramCanvas from "./canvas/DiagramCanvas.vue";
import { captureDiagram } from "./canvas/screenshot.ts";
import { refocusWhenLost } from "./editor/focus.ts";
import { isInMenu, isInteractive, isTextInput } from "./editor/keyboard.ts";
import { EditorKey, useEditor } from "./editor/useEditor.ts";
import { consoleLogger, createErrorReporter, listenUnhandledErrors } from "./notice/errors.ts";
import NoticeBanner from "./notice/NoticeBanner.vue";
import { createNotices } from "./notice/notices.ts";
import { resolveStartup } from "./persistence/startup.ts";
import type { Startup } from "./persistence/startup.ts";
import { useAutosave } from "./persistence/useAutosave.ts";
import EditorSidebar from "./sidebar/EditorSidebar.vue";
import { useTheme } from "./theme/useTheme.ts";
import type { DialogKind } from "./toolbar/dialogs.ts";
import EditorToolbar from "./toolbar/EditorToolbar.vue";
import ExportDialog from "./transfer/ExportDialog.vue";
import ImportDialog from "./transfer/ImportDialog.vue";
import ScreenshotDialog from "./transfer/ScreenshotDialog.vue";

const { startup } = defineProps<{ startup: Startup }>();

// 追わないのは、起動時の情報が描画中に変わらないため
const { initial, store, readonly, initialStatus } = resolveStartup(startup);
const canvas = useTemplateRef<InstanceType<typeof DiagramCanvas>>("canvas");
/** AI が図を変えている間 */
const agentLocked = ref(false);
const editor = useEditor(initial, {
  editable: () => !readonly && !agentLocked.value,
  restoreFocus: () => refocusWhenLost(canvasSvg),
});
provide(EditorKey, editor);
const notices = createNotices({ editor, startup, autosave: () => autosave });
const autosave = useAutosave(editor, store, {
  initialStatus,
  onProblem: notices.explain,
  // AI の変更を知らせないのは、頼んだ本人が、パネルで変わった所を見ているため
  onReload: (writer) => {
    if (writer !== "agent") notices.reloaded();
  },
  onUnwatched: notices.unwatched,
  onRecovered: notices.recovered,
});
const agent = startup.agent
  ? useAgent(startup.agent, { editor, autosave, locked: agentLocked })
  : undefined;
const theme = useTheme();
const notice = editor.notice;
const noticeKey = editor.noticeKey;
const dropping = ref(false);
const dialog = ref<DialogKind | null>(null);
let stops: (() => void)[] = [];

function canvasSvg() {
  return canvas.value?.svg ?? null;
}

function openDialog(kind: DialogKind) {
  dialog.value = kind;
}

function closeDialog() {
  dialog.value = null;
}

function onKeyDown(event: KeyboardEvent) {
  // メニューの側で伝播を止めないのは、メニューを Escape で閉じる処理も window で受けるため
  if (dialog.value !== null || isInMenu(event.target)) return;
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (mod && key === "z" && !isTextInput(event.target)) {
    event.preventDefault();
    if (event.shiftKey) editor.redo();
    else editor.undo();
    return;
  }
  if (mod && key === "y" && !isTextInput(event.target)) {
    event.preventDefault();
    editor.redo();
    return;
  }
  if (mod && key === "s") {
    event.preventDefault();
    editor.exportFile();
    return;
  }
  if (isTextInput(event.target)) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    editor.deleteSelection();
  } else if (event.key === "Escape") {
    editor.select(null);
    editor.setFocusedLoop(null);
  } else if (event.key === "Enter" && !isInteractive(event.target)) {
    const selected = editor.selection.value;
    if (selected?.kind === "variable") {
      event.preventDefault();
      editor.setEditingVariable(selected.id);
    }
  }
}

const reportError = createErrorReporter(editor.notify, consoleLogger);

// 伝えるのを止めるのは、Vue が既定でもコンソールに出し、二重になるため
onErrorCaptured((error, _instance, info) => {
  reportError(error, info);
  return false;
});

function hasFiles(event: DragEvent) {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

function onDragOver(event: DragEvent) {
  if (!hasFiles(event) || dialog.value !== null) return;
  event.preventDefault();
  dropping.value = true;
}

function onDragLeave(event: DragEvent) {
  if (event.relatedTarget === null) dropping.value = false;
}

function onDrop(event: DragEvent) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dropping.value = false;
  const file = event.dataTransfer?.files[0];
  if (file) void editor.importFile(file);
}

// 常にスクロールしないのは、広い画面では一覧とキャンバスが並んでいて要らないため。
// 完全に隠れたときだけにしないのは、少し見えていても中央が外れると変化が見えないため
function revealCanvas() {
  const svg = canvasSvg();
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const middle = rect.top + rect.height / 2;
  if (middle >= 0 && middle <= window.innerHeight) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  svg.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
}

function capture() {
  const svg = canvasSvg();
  return svg ? captureDiagram(svg) : Promise.reject(new Error("図が見つかりません"));
}

onMounted(() => {
  notices.atStartup(initialStatus);
  stops = [
    autosave.start(),
    theme.start(),
    listenUnhandledErrors(window, reportError),
    ...(agent ? [agent.start()] : []),
  ];
  window.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  for (const stop of stops) stop();
  window.removeEventListener("keydown", onKeyDown);
});
</script>

<template>
  <!-- 右へのスワイプで消さないのは、お知らせが画面の上の中央に出るため -->
  <ToastProvider label="お知らせ" swipe-direction="up">
    <TooltipProvider>
      <div
        class="app"
        :data-dropping="dropping ? '' : undefined"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <EditorToolbar
          :readonly
          :theme
          :autosave
          @dialog:open="openDialog"
          @explain:status="notices.explain"
          @explain:unwatched="notices.unwatched"
        >
          <AgentToggle
            v-if="agent"
            :open="agent.open.value"
            :running="agent.running.value"
            @update:open="(open) => (agent!.open.value = open)"
          />
        </EditorToolbar>
        <!-- 狭い画面でページごとスクロールさせないのは、キャンバスのパンとページのスクロールが同じ指の操作で取り合うため -->
        <main class="workspace-area">
          <DiagramCanvas ref="canvas" class="canvas-area" :touched="agent?.touched.value" />
          <AgentBanner
            v-if="agent?.running.value"
            class="agent-status-banner"
            @agent:stop="() => void agent!.stop()"
          />
          <AgentPanel
            v-if="agent?.open.value"
            :agent
            @panel:close="() => (agent!.open.value = false)"
          />
          <!-- 消さずに隠すのは、AI のパネルを閉じたときに、一覧のタブやスクロール位置を戻すため -->
          <EditorSidebar v-show="!agent?.open.value" @canvas:reveal="revealCanvas" />
        </main>
        <!-- key で作り直すのは、別のお知らせに替わったときに、出てくる動きと消えるまでの時間を付け直すため -->
        <NoticeBanner
          v-if="notice"
          :key="noticeKey"
          :notice
          @notice:close="(closed) => editor.dismissNotice(closed)"
        />
        <ImportDialog v-if="dialog === 'import'" @dialog:close="closeDialog" />
        <ExportDialog v-if="dialog === 'export'" @dialog:close="closeDialog" />
        <ScreenshotDialog v-if="dialog === 'screenshot'" :capture @dialog:close="closeDialog" />
        <div class="drop-overlay" aria-hidden="true">
          <p>JSON ファイルをドロップして読み込む</p>
        </div>
      </div>
      <ToastViewport as-child label="お知らせ（{hotkey}）">
        <ol class="notice-viewport" />
      </ToastViewport>
    </TooltipProvider>
  </ToastProvider>
</template>

<style scoped>
/* .app の中に入れ子にしないのは、reka-ui が読み上げの領域の div で包んで描くため */
.notice-viewport {
  position: fixed;
  inset-block-start: 68px;
  inset-inline: 0;
  z-index: var(--z-overlay);
  display: grid;
  inline-size: min(480px, calc(100vw - 32px));
  margin-inline: auto;
  outline: none;
}

.app {
  display: grid;
  block-size: 100dvh;
  grid-template-rows: 56px minmax(0, 1fr);
  overflow: hidden;

  > .workspace-area {
    display: grid;
    min-block-size: 0;
    grid-template-columns: minmax(0, 1fr) 368px;

    @media (width < 48rem) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
    }

    /* 場所を決めておくのは、帯をキャンバスに重ねるため。決めないと、帯が空いている次の枠に入る */
    > .canvas-area,
    > .agent-status-banner {
      grid-area: 1 / 1;
    }

    > .agent-status-banner {
      z-index: var(--z-raised);
      align-self: start;
      justify-self: center;
      margin-block-start: 16px;
    }
  }

  > .drop-overlay {
    position: fixed;
    inset: 12px;
    z-index: var(--z-popover);
    display: grid;
    place-items: center;
    border: 1.5px dashed var(--color-accent);
    border-radius: var(--radius-xl);
    background: var(--color-glass);
    font-size: var(--text-lg);
    font-weight: 500;
    color: var(--color-accent-strong);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  &[data-dropping] > .drop-overlay {
    opacity: 1;
  }
}
</style>
