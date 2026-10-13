<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 16 });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M20 12.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7.5" />
    <path d="M2 8.5h20V12H2z" />
    <path d="M12 8.5V21" />
    <path d="M12 8.5s-1.6-4.6-4-4.6A2.6 2.6 0 0 0 6.7 8c1.3 0 2.6-.3 3.8-1.2" />
    <path d="M12 8.5s1.6-4.6 4-4.6a2.6 2.6 0 0 1 1.3 4.3c-1.2.8-2.5 1.1-3.8 1" />
  </svg>
</template>