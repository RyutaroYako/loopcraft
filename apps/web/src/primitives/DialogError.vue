<script setup lang="ts">
import DetailList from "./DetailList.vue";

const { title, errors } = defineProps<{ title: string; errors: readonly string[] }>();
</script>

<template>
  <div class="dialog-error" role="alert">
    <p class="error-title">{{ title }}</p>
    <DetailList :items="errors" />
  </div>
</template>

<style scoped>
@layer components {
  .dialog-error {
    display: grid;
    gap: 4px;
    border: 1px solid var(--color-negative-line);
    border-radius: var(--radius-sm);
    background: var(--color-negative-soft);
    padding: 10px 12px;

    > .error-title {
      font-weight: 600;
      color: var(--color-negative);
    }
  }
}
</style>
