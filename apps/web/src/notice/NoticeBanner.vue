<script setup lang="ts">
import { ToastClose, ToastDescription, ToastRoot, ToastTitle } from "reka-ui";
import BaseButton from "../primitives/BaseButton.vue";
import DetailList from "../primitives/DetailList.vue";
import IconButton from "../primitives/IconButton.vue";
import SvgIcon from "../primitives/SvgIcon.vue";
import type { Notice } from "./useNotices.ts";

const INFO_MS = 3200;

const { notice } = defineProps<{ notice: Notice }>();

const emit = defineEmits<{ "notice:close": [notice: Notice] }>();

function onOpenChange(open: boolean) {
  if (!open) emit("notice:close", notice);
}
</script>

<template>
  <!-- エラーを時間で消さないのは、読み終える前や、対処のボタンを押す前に消えてしまうため -->
  <ToastRoot
    as-child
    :type="notice.tone === 'error' ? 'foreground' : 'background'"
    :duration="notice.tone === 'error' ? Infinity : INFO_MS"
    @update:open="onOpenChange"
  >
    <li class="notice-banner" :data-tone="notice.tone">
      <div class="message-body">
        <ToastTitle as-child>
          <p class="message-title">{{ notice.title }}</p>
        </ToastTitle>
        <ToastDescription v-if="notice.details?.length" as-child>
          <DetailList :items="notice.details" />
        </ToastDescription>
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
      <ToastClose as-child>
        <IconButton aria-label="閉じる">
          <SvgIcon name="close" />
        </IconButton>
      </ToastClose>
    </li>
  </ToastRoot>
</template>

<style scoped>
.notice-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
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

  &[data-swipe="move"] {
    translate: 0 var(--reka-toast-swipe-move-y);
  }

  &[data-swipe="cancel"] {
    translate: 0 0;
    transition: translate var(--duration-fast) var(--ease-out);
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
