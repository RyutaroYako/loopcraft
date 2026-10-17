<script setup lang="ts">
import BaseButton from "../primitives/BaseButton.vue";
import DetailList from "../primitives/DetailList.vue";
import IconButton from "../primitives/IconButton.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import type { Notice } from "./useNotices.ts";

const { notice } = defineProps<{ notice: Notice }>();

const emit = defineEmits<{ "click:close": [] }>();
</script>

<template>
  <div
    class="notice-banner"
    :data-tone="notice.tone"
    :role="notice.tone === 'error' ? 'alert' : 'status'"
    aria-label="お知らせ"
  >
    <div class="message-body">
      <p class="message-title">{{ notice.title }}</p>
      <DetailList v-if="notice.details?.length" :items="notice.details" />
      <div v-if="notice.actions?.length" class="action-buttons">
        <BaseButton
          v-for="action in notice.actions"
          :key="action.label"
          size="small"
          @click="action.run"
        >
          {{ action.label }}
        </BaseButton>
      </div>
    </div>
    <IconButton aria-label="閉じる" @click="() => emit('click:close')">
      <SvgIcon name="close" />
    </IconButton>
  </div>
</template>

<style scoped>
/* -50% だけずらす translate を使わないのは、translate プロパティが登場アニメーションの transform と重なり、二重にずれるため */
.notice-banner {
  position: fixed;
  inset-block-start: 68px;
  inset-inline-start: 50%;
  z-index: var(--z-overlay);
  display: flex;
  inline-size: min(480px, calc(100vw - 32px));
  align-items: flex-start;
  gap: 12px;
  transform: translateX(-50%);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  padding-block: 12px;
  padding-inline: 16px 8px;
  box-shadow: var(--shadow-float);
  animation: var(--animate-notice-in);

  &[data-tone="error"] {
    border-color: var(--color-negative-line);
  }

  > .message-body {
    display: grid;
    min-inline-size: 0;
    flex: 1;
    gap: 6px;
    padding-block-start: 4px;

    > .message-title {
      font-weight: 600;
    }

    > .action-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding-block-start: 4px;
    }
  }

  &[data-tone="error"] > .message-body > .message-title {
    color: var(--color-negative);
  }
}
</style>
