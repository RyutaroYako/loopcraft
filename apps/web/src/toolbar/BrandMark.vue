<template>
  <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
    <rect class="tile-rect" width="64" height="64" rx="14" />
    <path
      class="loop-arc-path"
      d="M17.87 24.49A16 16 0 0 1 47.04 26.53M46.13 39.51A16 16 0 0 1 16.96 37.47"
      fill="none"
      stroke-width="5"
      stroke-linecap="round"
    />
    <path
      class="arrowhead-path"
      d="M49.09 32.17L52.21 24.65L41.87 28.41ZM14.91 31.83L11.79 39.35L22.13 35.59Z"
    />
    <circle class="center-circle" cx="32" cy="32" r="4.5" />
  </svg>
</template>

<style scoped>
.brand-mark {
  inline-size: 22px;
  block-size: 22px;

  > .tile-rect {
    fill: var(--color-brand-tile);
  }

  > .loop-arc-path {
    stroke: var(--color-brand-loop);
  }

  > .arrowhead-path {
    fill: var(--color-brand-loop);
  }

  > .center-circle {
    fill: var(--color-brand-dot);
  }
}
</style>
