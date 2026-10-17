<script setup lang="ts">
import type { Link, LinkId } from "@loopcraft/core/schema";
import FieldLabel from "../primitives/FieldLabel.vue";
import PolarityGlyph from "./PolarityGlyph.vue";

const { title, empty, links, labelOf } = defineProps<{
  title: string;
  empty: string;
  links: readonly Link[];
  labelOf: (link: Link) => string;
}>();

const emit = defineEmits<{ "select:link": [id: LinkId] }>();
</script>

<template>
  <div class="relation-list">
    <FieldLabel as="p">{{ title }}</FieldLabel>
    <ul v-if="links.length > 0" class="link-list">
      <li v-for="link in links" :key="link.id" class="link-item">
        <button type="button" class="link-button" @click="() => emit('select:link', link.id)">
          <PolarityGlyph :polarity="link.polarity" />
          <span class="label-text">{{ labelOf(link) }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="empty-text">{{ empty }}</p>
  </div>
</template>

<style scoped>
.relation-list {
  display: grid;
  align-content: start;
  gap: 6px;

  > .link-list {
    display: grid;
    gap: 2px;

    > .link-item > .link-button {
      display: flex;
      inline-size: 100%;
      align-items: center;
      gap: 8px;
      margin-inline-start: -6px;
      border-radius: var(--radius-xs);
      padding: 5px 6px;
      text-align: start;
      font-size: var(--text-base);

      &:hover {
        @media (hover: hover) {
          background: var(--color-surface-2);
        }
      }

      > .label-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  > .empty-text {
    font-size: var(--text-sm);
    color: var(--color-muted);
  }
}
</style>
