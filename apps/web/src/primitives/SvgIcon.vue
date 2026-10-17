<script setup lang="ts">
import type { IconName } from "./icons.ts";

const { name } = defineProps<{ name: IconName }>();
</script>

<template>
  <svg
    class="svg-icon"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'undo'">
      <path d="M7.5 5 4 8.5 7.5 12" />
      <path d="M4 8.5h8a4 4 0 0 1 0 8H9.5" />
    </template>
    <template v-else-if="name === 'redo'">
      <path d="M12.5 5 16 8.5 12.5 12" />
      <path d="M16 8.5H8a4 4 0 0 0 0 8h2.5" />
    </template>
    <template v-else-if="name === 'file'">
      <path
        d="M11.5 2.75H6a1.25 1.25 0 0 0-1.25 1.25v12A1.25 1.25 0 0 0 6 17.25h8A1.25 1.25 0 0 0 15.25 16V6.5z"
      />
      <path d="M11.5 2.75V6.5h3.75" />
    </template>
    <template v-else-if="name === 'open'">
      <path d="M10 12.5V3" />
      <path d="m6.5 6.5 3.5-3.5 3.5 3.5" />
      <path d="M3.5 12.5v2.75c0 .7.55 1.25 1.25 1.25h10.5c.7 0 1.25-.55 1.25-1.25V12.5" />
    </template>
    <template v-else-if="name === 'save'">
      <path d="M10 3v9.5" />
      <path d="m6.5 9 3.5 3.5L13.5 9" />
      <path d="M3.5 12.5v2.75c0 .7.55 1.25 1.25 1.25h10.5c.7 0 1.25-.55 1.25-1.25V12.5" />
    </template>
    <template v-else-if="name === 'layout'">
      <circle cx="10" cy="4.5" r="2" />
      <circle cx="4.5" cy="15" r="2" />
      <circle cx="15.5" cy="15" r="2" />
      <path d="M9 6.3 5.5 13.2M11 6.3l3.5 6.9M6.5 15h7" />
    </template>
    <template v-else-if="name === 'image'">
      <rect x="3" y="3.75" width="14" height="12.5" rx="1.75" />
      <circle cx="7.25" cy="8" r="1.25" />
      <path d="m3.5 14.25 4-4 3 3 2-2 4 4" />
    </template>
    <template v-else-if="name === 'copy'">
      <rect x="7" y="7" width="9.25" height="9.25" rx="1.5" />
      <path
        d="M13 7V5.25c0-.83-.67-1.5-1.5-1.5H5.25c-.83 0-1.5.67-1.5 1.5v6.25c0 .83.67 1.5 1.5 1.5H7"
      />
    </template>
    <template v-else-if="name === 'check'">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M10 4.5v11M4.5 10h11" />
    </template>
    <template v-else-if="name === 'minus'">
      <path d="M4.5 10h11" />
    </template>
    <template v-else-if="name === 'fit'">
      <path
        d="M3.5 7V4.75c0-.7.55-1.25 1.25-1.25H7M13 3.5h2.25c.7 0 1.25.55 1.25 1.25V7M16.5 13v2.25c0 .7-.55 1.25-1.25 1.25H13M7 16.5H4.75c-.7 0-1.25-.55-1.25-1.25V13"
      />
      <rect x="7" y="7" width="6" height="6" rx="1" />
    </template>
    <template v-else-if="name === 'pin' || name === 'pin-filled'">
      <path
        d="M10 2.75 12.2 7.2l4.9.7-3.55 3.45.85 4.9L10 13.95 5.6 16.25l.85-4.9L2.9 7.9l4.9-.7z"
        :fill="name === 'pin-filled' ? 'currentColor' : 'none'"
      />
    </template>
    <template v-else-if="name === 'close'">
      <path d="m5 5 10 10M15 5 5 15" />
    </template>
    <template v-else-if="name === 'lock'">
      <rect x="4.5" y="9" width="11" height="8" rx="1.75" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </template>
    <template v-else-if="name === 'spark'">
      <path
        d="M10 3v3M10 14v3M3 10h3M14 10h3M5.05 5.05l2.1 2.1M12.85 12.85l2.1 2.1M5.05 14.95l2.1-2.1M12.85 7.15l2.1-2.1"
      />
    </template>
    <template v-else-if="name === 'arrow-right'">
      <path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" />
    </template>
    <template v-else-if="name === 'more'">
      <circle cx="4.5" cy="10" r="0.9" fill="currentColor" />
      <circle cx="10" cy="10" r="0.9" fill="currentColor" />
      <circle cx="15.5" cy="10" r="0.9" fill="currentColor" />
    </template>
    <template v-else-if="name === 'sun'">
      <circle cx="10" cy="10" r="3.25" />
      <path
        d="M10 2.75v1.5M10 15.75v1.5M2.75 10h1.5M15.75 10h1.5M4.87 4.87l1.06 1.06M14.07 14.07l1.06 1.06M4.87 15.13l1.06-1.06M14.07 5.93l1.06-1.06"
      />
    </template>
    <template v-else-if="name === 'moon'">
      <path d="M16 11.6A6.25 6.25 0 1 1 8.4 4a5 5 0 0 0 7.6 7.6Z" />
    </template>
    <template v-else-if="name === 'monitor'">
      <rect x="3" y="4" width="14" height="9.5" rx="1.5" />
      <path d="M7.5 16.5h5M10 13.5v3" />
    </template>
  </svg>
</template>

<style scoped>
@layer components {
  .svg-icon {
    inline-size: 18px;
    block-size: 18px;
    flex: none;
  }
}
</style>
