<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { injectEditor } from "../editor/useEditor.ts";
import BaseButton from "../primitives/BaseButton.vue";
import CopyButton from "../primitives/CopyButton.vue";
import DialogError from "../primitives/DialogError.vue";
import ModalDialog from "../primitives/ModalDialog.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import { downloadBlob, fileNameOf } from "./file.ts";

type Shot =
  | { status: "capturing" }
  | { status: "ready"; blob: Blob; url: string }
  | { status: "failed"; error: string };

const { capture } = defineProps<{ capture: () => Promise<Blob> }>();

const emit = defineEmits<{ "dialog:close": [] }>();

const editor = injectEditor();
const shot = ref<Shot>({ status: "capturing" });
const blob = computed(() => (shot.value.status === "ready" ? shot.value.blob : undefined));
const title = computed(() => editor.diagram.value.title || "無題のシステム図");

onMounted(() => {
  // 選択を外してすぐ写さないのは、描き直される前の選択の枠や名前の入力欄が写るため
  editor.select(null);
  editor.setEditingVariable(null);
  requestAnimationFrame(() => {
    capture().then(
      (captured) => {
        shot.value = { status: "ready", blob: captured, url: URL.createObjectURL(captured) };
      },
      (error: unknown) => {
        shot.value = {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
      },
    );
  });
});

onUnmounted(() => {
  if (shot.value.status === "ready") URL.revokeObjectURL(shot.value.url);
});

function save() {
  if (blob.value) downloadBlob(blob.value, `${fileNameOf(editor.diagram.value.title)}.png`);
}

function copy() {
  const current = blob.value;
  if (!current) return Promise.reject(new Error("画像がまだありません"));
  return navigator.clipboard.write([new ClipboardItem({ "image/png": current })]);
}
</script>

<template>
  <ModalDialog
    class="screenshot-dialog"
    title="画像として書き出す"
    size="large"
    @dialog:close="() => emit('dialog:close')"
  >
    <div class="preview-frame">
      <p v-if="shot.status === 'capturing'" class="capturing-text">画像を作っています…</p>
      <DialogError
        v-else-if="shot.status === 'failed'"
        title="画像を作れませんでした"
        :errors="[shot.error]"
      />
      <img v-else class="preview-image" :src="shot.url" :alt="`${title} の画像`" />
    </div>
    <template #footer-start>
      <BaseButton variant="ghost" :disabled="!blob" @click="save">
        <SvgIcon name="save" />
        PNG を保存
      </BaseButton>
    </template>
    <template #footer>
      <CopyButton :disabled="!blob" :copy />
    </template>
  </ModalDialog>
</template>

<style scoped>
.screenshot-dialog {
  .preview-frame {
    display: grid;
    min-block-size: 240px;
    place-items: center;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-md);
    background: var(--color-canvas);
    padding: 16px;

    > .capturing-text {
      font-size: var(--text-base);
      color: var(--color-muted);
    }

    > .preview-image {
      display: block;
      max-block-size: calc(100dvh - 280px);
      max-inline-size: 100%;
      object-fit: contain;
    }
  }
}
</style>
