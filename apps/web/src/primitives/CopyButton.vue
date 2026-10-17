<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import BaseButton from "./BaseButton.vue";
import SvgIcon from "./SvgIcon.vue";

const COPIED_MS = 2000;

const {
  copy,
  disabled = false,
  label = "コピー",
} = defineProps<{
  copy: () => Promise<void>;
  disabled?: boolean;
  label?: string;
}>();

const state = ref<"idle" | "copied" | "failed">("idle");
let timer: ReturnType<typeof setTimeout> | undefined;

onUnmounted(() => clearTimeout(timer));

async function run() {
  try {
    await copy();
    state.value = "copied";
  } catch {
    state.value = "failed";
  }
  clearTimeout(timer);
  timer = setTimeout(() => (state.value = "idle"), COPIED_MS);
}
</script>

<template>
  <BaseButton variant="primary" :disabled @click="run">
    <SvgIcon :name="state === 'copied' ? 'check' : 'copy'" />
    <span aria-live="polite">
      {{
        state === "copied"
          ? "コピーしました"
          : state === "failed"
            ? "コピーできませんでした"
            : label
      }}
    </span>
  </BaseButton>
</template>
