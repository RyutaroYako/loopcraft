<template>
  <ul class="row-list">
    <slot />
  </ul>
</template>

<style scoped>
@layer components {
  .row-list {
    display: grid;
    min-block-size: 0;
    flex: 1;
    align-content: start;
    gap: 2px;
    overflow-y: auto;
    padding: 0 10px 20px;

    @media (width < 48rem) {
      flex: none;
      overflow: visible;
    }
  }
}
</style>
