<template>
  <span class="field-hint"><slot /></span>
</template>

<style scoped>
@layer components {
  .field-hint {
    display: block;
    font-size: var(--text-sm);
    color: var(--color-muted);
  }
}
</style>
