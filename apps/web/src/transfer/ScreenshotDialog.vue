<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { injectEditor } from "../editor/useEditor.ts";
import BaseButton from "../primitives/BaseButton.vue";
import CopyButton from "../primitives/CopyButton.vue";
import DialogError from "../primitives/DialogError.vue";
import ModalDialog from "../primitives/ModalDialog.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import ToggleSwitch from "../primitives/ToggleSwitch.vue";
import { downloadBlob, fileNameOf } from "./file.ts";
import { hasLegendText, legendItemsOf } from "./legend.ts";
import { appendLegend } from "./legendImage.ts";

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
const legendItems = computed(() => legendItemsOf(editor.loopEntries.value));
const legendAvailable = computed(() => hasLegendText(legendItems.value));
const withLegend = ref(true);
/** 凡例を付けた画像だけを持たないのは、切り替えるたびに図を写し直すことになるため */
let plain: Blob | undefined;

function fail(error: unknown) {
  shot.value = { status: "failed", error: error instanceof Error ? error.message : String(error) };
}

let generation = 0;

// 終わった順に表示しないのは、凡例を切り替えた後に前の合成が終わると、選んでいない方の画像が出るため
async function compose() {
  if (!plain) return;
  const current = ++generation;
  let next: Blob;
  try {
    next =
      withLegend.value && legendAvailable.value
        ? await appendLegend(plain, legendItems.value)
        : plain;
  } catch (error) {
    if (current === generation) fail(error);
    return;
  }
  if (current !== generation) return;
  if (shot.value.status === "ready") URL.revokeObjectURL(shot.value.url);
  shot.value = { status: "ready", blob: next, url: URL.createObjectURL(next) };
}

watch(withLegend, compose);

onMounted(() => {
  // 選択を外してすぐ写さないのは、描き直される前の選択の枠や名前の入力欄が写るため
  editor.select(null);
  editor.setEditingVariable(null);
  requestAnimationFrame(() => {
    capture()
      .then((captured) => {
        plain = captured;
        return compose();
      })
      .catch(fail);
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
    title="画像を書き出す"
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
      <ToggleSwitch
        v-if="legendAvailable"
        label="ループの説明を入れる"
        :checked="withLegend"
        @update:checked="(checked) => (withLegend = checked)"
      />
    </template>
    <template #footer>
      <BaseButton variant="ghost" :disabled="!blob" @click="save">
        <SvgIcon name="save" />
        ファイルに保存
      </BaseButton>
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
