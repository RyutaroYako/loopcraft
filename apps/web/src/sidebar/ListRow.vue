<script setup lang="ts">
import { computed, useSlots } from "vue";

const {
  active,
  index,
  muted = false,
} = defineProps<{
  active: boolean;
  index: number;
  muted?: boolean;
}>();

const emit = defineEmits<{ "click:row": [] }>();

defineSlots<{
  leading?: () => unknown;
  title: () => unknown;
  route: () => unknown;
  trailing?: () => unknown;
  after?: () => unknown;
}>();

const slots = useSlots();
const order = computed(() => ({ "--index": Math.min(index, 12) }));
</script>

<template>
  <li class="list-row" :data-active="active ? '' : undefined" :style="order">
    <button
      type="button"
      class="select-button"
      :data-leading="slots.leading ? '' : undefined"
      :aria-current="active ? 'true' : undefined"
      @click="() => emit('click:row')"
    >
      <slot name="leading" />
      <span class="label-area">
        <span class="title-text" :data-muted="muted ? '' : undefined"><slot name="title" /></span>
        <span class="route-text"><slot name="route" /></span>
      </span>
      <slot name="trailing" />
    </button>
    <slot name="after" />
  </li>
</template>

<style scoped>
@layer components {
  .list-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    border-radius: var(--radius-md);
    animation: rise 0.4s var(--ease-out) calc(var(--index) * 35ms) both;
    transition: background-color var(--duration-fast) var(--ease-out);

    &:hover {
      @media (hover: hover) {
        background: var(--color-surface-2);
      }
    }

    &[data-active] {
      background: var(--color-surface-2);

      &::before {
        position: absolute;
        inset-block: 10px;
        inset-inline-start: 0;
        inline-size: 2px;
        border-radius: var(--radius-full);
        background: var(--color-accent);
        content: "";
      }
    }

    > .select-button {
      display: grid;
      min-inline-size: 0;
      grid-template-columns: minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      padding-block: 9px;
      padding-inline: 10px 4px;
      text-align: start;

      &[data-leading] {
        grid-template-columns: 30px minmax(0, 1fr) auto;
      }

      > .label-area {
        display: grid;
        min-inline-size: 0;

        > .title-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: var(--text-base);
          font-weight: 500;

          &[data-muted] {
            color: var(--color-ink-2);
          }
        }

        > .route-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: var(--text-sm);
          color: var(--color-muted);
        }
      }
    }
  }
}
</style>
