<template>
  <span class="visually-hidden"><slot /></span>
</template>

<style scoped>
@layer components {
  .visually-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border-width: 0;
  }
}
</style>
