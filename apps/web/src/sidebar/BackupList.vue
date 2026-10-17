<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import { VisuallyHidden } from "reka-ui";
import { refocusWhenLost } from "../editor/focus.ts";
import { injectEditor } from "../editor/useEditor.ts";
import { readBackup, removeBackup } from "../persistence/storage.ts";
import type { Backup } from "../persistence/storage.ts";
import BaseButton from "../primitives/BaseButton.vue";
import FieldHint from "../primitives/FieldHint.vue";
import FieldLabel from "../primitives/FieldLabel.vue";
import { downloadText } from "../transfer/file.ts";

const { backups } = defineProps<{ backups: readonly Backup[] }>();

const emit = defineEmits<{ "backups:changed": []; "focus:lost": [] }>();

const editor = injectEditor();
// 押してすぐ消さないのは、唯一の写しで元に戻せないため
const confirming = ref<string | null>(null);
const list = useTemplateRef<HTMLDivElement>("list");

function download(key: string, savedAt: Date) {
  const text = readBackup(key);
  if (text === undefined) {
    emit("backups:changed");
    editor.notify({
      tone: "error",
      title: "退避したデータが見つかりません",
      details: ["別のタブで削除された可能性があります"],
    });
    return;
  }
  downloadText(text, `system-diagram-backup-${savedAt.getTime()}.json`);
}

function remove(key: string) {
  removeBackup(key);
  confirming.value = null;
  emit("backups:changed");
  // 移さないと、押したボタンが行ごと消えてフォーカスが失われる
  refocusWhenLost(() => list.value?.querySelector("button"));
  emit("focus:lost");
}

function primary(key: string, savedAt: Date) {
  if (confirming.value === key) remove(key);
  else download(key, savedAt);
}

function toggleConfirm(key: string) {
  confirming.value = confirming.value === key ? null : key;
}
</script>

<template>
  <div ref="list" class="backup-list">
    <FieldLabel as="p">退避したデータ</FieldLabel>
    <VisuallyHidden aria-live="polite">
      {{ confirming ? "削除すると元に戻せません。「削除する」か「やめる」を選んでください" : "" }}
    </VisuallyHidden>
    <FieldHint>開けなかった前回の図です。書き出して内容を確かめられます</FieldHint>
    <ul class="saved-list">
      <li v-for="backup in backups" :key="backup.key" class="saved-item">
        <span class="saved-at-text">{{ backup.savedAt.toLocaleString("ja-JP") }}</span>
        <!--
          確認用のボタンに差し替えないのは、押したボタンのフォーカスが失われるため。
          差し替えなければ、「削除」を押すと同じ位置の「やめる」にフォーカスが乗る
        -->
        <BaseButton
          variant="ghost"
          size="small"
          :tone="confirming === backup.key ? 'danger' : 'default'"
          @click="() => primary(backup.key, backup.savedAt)"
        >
          {{ confirming === backup.key ? "削除する" : "書き出す" }}
        </BaseButton>
        <BaseButton variant="ghost" size="small" @click="() => toggleConfirm(backup.key)">
          {{ confirming === backup.key ? "やめる" : "削除" }}
        </BaseButton>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.backup-list {
  display: grid;
  gap: 6px;
  border-block-start: 1px solid var(--color-line);
  padding-block-start: 14px;

  > .saved-list > .saved-item {
    display: flex;
    align-items: center;
    gap: 4px;

    > .saved-at-text {
      flex: 1;
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      color: var(--color-ink-2);
    }
  }
}
</style>
