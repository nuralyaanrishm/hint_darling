<script setup lang="ts">
withDefaults(defineProps<{ size?: number; flip?: boolean }>(), {
  size: 56,
  flip: false,
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 56 56"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    class="text-sage-deep"
    :class="flip ? 'scale-x-[-1]' : ''"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M28 54C24 40 24 20 30 4" />
    <path d="M27 40c-7-1-11-5-12-12 7 1 11 5 12 12Z" />
    <path d="M28 30c7-1 11-5 12-12-7 1-11 5-12 12Z" />
    <path d="M28.5 20c-6-1-9-4-10-10 6 1 9 4 10 10Z" />
    <circle cx="30" cy="5" r="3" fill="currentColor" stroke="none" />
  </svg>
</template>
