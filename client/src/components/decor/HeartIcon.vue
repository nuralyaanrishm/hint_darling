<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 16 });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M12 20.7 10.6 19.4C5.4 14.8 2 11.7 2 7.9 2 4.8 4.4 2.5 7.5 2.5c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1 3.1 0 5.5 2.3 5.5 5.4 0 3.8-3.4 6.9-8.6 11.5z"
    />
  </svg>
</template>
