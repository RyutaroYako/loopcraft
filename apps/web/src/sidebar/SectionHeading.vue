<script setup lang="ts">
import EyebrowLabel from "../primitives/EyebrowLabel.vue";

const { kicker, title } = defineProps<{ kicker: string; title: string }>();
</script>

<template>
  <header class="section-heading">
    <EyebrowLabel>{{ kicker }}</EyebrowLabel>
    <h2 class="title-heading">{{ title }}</h2>
  </header>
</template>

<style scoped>
@layer components {
  .section-heading {
    display: grid;
    gap: 2px;

    > .title-heading {
      font-size: var(--text-xl);
      font-weight: 600;
      letter-spacing: var(--tracking-heading);
    }
  }
}
</style>
