<script setup lang="ts">
import SvgIcon from "../primitives/SvgIcon.vue";

const emit = defineEmits<{ "agent:stop": [] }>();
</script>

<template>
  <div class="agent-banner" role="status">
    <span class="running-badge" aria-hidden="true" />
    <span class="status-text">AI が図を変えています（編集不可）</span>
    <button type="button" class="stop-button" @click="() => emit('agent:stop')">
      <SvgIcon name="stop" class="stop-icon" />
      停止
    </button>
  </div>
</template>

<style scoped>
.agent-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: var(--radius-full);
  background: var(--color-glass);
  box-shadow:
    0 0 0 1px var(--color-line),
    var(--shadow-float);
  padding: 5px 5px 5px 14px;
  white-space: nowrap;
  backdrop-filter: blur(8px);

  > .running-badge {
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--radius-full);
    background: var(--color-accent);
    animation: var(--animate-save-pulse);
  }

  > .status-text {
    font-size: var(--text-base);
    font-weight: 500;
  }

  > .stop-button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    block-size: 28px;
    border-radius: var(--radius-full);
    background: var(--color-surface-2);
    padding-inline: 8px 12px;
    font-size: var(--text-sm);
    font-weight: 500;
    transition: background-color var(--duration-fast) var(--ease-out);

    &:hover {
      background: var(--color-line);
    }

    > .stop-icon {
      inline-size: 14px;
      block-size: 14px;
    }
  }
}
</style>
