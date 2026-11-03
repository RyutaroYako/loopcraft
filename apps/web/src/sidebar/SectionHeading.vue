<script setup lang="ts">
const { title } = defineProps<{ title: string }>();
</script>

<template>
  <h2 class="section-heading">{{ title }}</h2>
</template>

<style scoped>
@layer components {
  .section-heading {
    font-size: var(--text-xl);
    font-weight: 600;
    letter-spacing: var(--tracking-heading);
  }
}
</style>
