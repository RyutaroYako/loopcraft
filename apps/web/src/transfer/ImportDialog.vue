<script setup lang="ts">
import { ref, useId, useTemplateRef } from "vue";
import { parseDiagramJson } from "@loopcraft/core/io";
import { injectEditor } from "../editor/useEditor.ts";
import BaseButton from "../primitives/BaseButton.vue";
import DialogError from "../primitives/DialogError.vue";
import ModalDialog from "../primitives/ModalDialog.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import TextField from "../primitives/TextField.vue";
import { pickJsonFile } from "./file.ts";
import { formatParseErrors } from "./readDiagramFile.ts";

const emit = defineEmits<{ "dialog:close": [] }>();

const PLACEHOLDER = '{ "version": 1, "title": "…", … }';

const editor = injectEditor();
const text = ref("");
const errors = ref<string[]>([]);
const dialog = useTemplateRef<InstanceType<typeof ModalDialog>>("dialog");
const formId = useId();

function close() {
  dialog.value?.close();
}

function onInput(value: string) {
  text.value = value;
  errors.value = [];
}

function submit() {
  const result = parseDiagramJson(text.value);
  if (!result.ok) {
    errors.value = formatParseErrors(result.errors);
    return;
  }
  editor.replaceDiagram(result.diagram);
  editor.notify({ tone: "info", title: "JSON を読み込みました" });
  close();
}

async function openFile() {
  const file = await pickJsonFile();
  if (!file) return;
  close();
  await editor.importFile(file);
}
</script>

<template>
  <ModalDialog ref="dialog" title="JSON を読み込む" @dialog:close="() => emit('dialog:close')">
    <form :id="formId" @submit.prevent="submit">
      <TextField
        initial-focus
        label="図の JSON を貼り付けてください。今の図は置き換わります（元に戻せます）"
        :value="text"
        :placeholder="PLACEHOLDER"
        code
        @update:value="onInput"
      />
    </form>
    <DialogError v-if="errors.length > 0" title="読み込めませんでした" :errors />
    <template #footer-start>
      <BaseButton variant="ghost" @click="openFile">
        <SvgIcon name="open" />
        ファイルから選ぶ
      </BaseButton>
    </template>
    <template #footer>
      <BaseButton @click="close">キャンセル</BaseButton>
      <BaseButton type="submit" :form="formId" variant="primary" :disabled="text.trim() === ''">
        読み込む
      </BaseButton>
    </template>
  </ModalDialog>
</template>
