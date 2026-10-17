<template>
  <div class="empty-message">
    <slot />
  </div>
</template>

<style scoped>
@layer components {
  .empty-message {
    display: grid;
    align-content: start;
    justify-items: start;
    gap: 10px;
    padding: 8px 20px;
    font-size: var(--text-sm);
    color: var(--color-muted);
  }
}
</style>
