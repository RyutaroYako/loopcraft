<template>
  <p class="eyebrow-label"><slot /></p>
</template>

<style scoped>
@layer components {
  .eyebrow-label {
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    font-weight: 500;
    letter-spacing: var(--tracking-label);
    text-transform: uppercase;
    color: var(--color-muted);
  }
}
</style>
