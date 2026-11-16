<script setup lang="ts">
/*
  The ink bow. Purely the fallback now: it holds the card's bow-shaped space
  while the WebGL scene loads, and stays in charge on small screens, with
  reduced motion, or without WebGL. `painted` retires it once the satin ribbon
  has drawn a frame.
*/

withDefaults(defineProps<{ painted?: boolean; open?: boolean }>(), {
  painted: false,
  open: false,
});
</script>

<template>
  <div class="mx-auto h-[66px] w-[120px]">
    <svg
      width="120"
      height="66"
      viewBox="0 0 72 40"
      fill="none"
      class="h-full w-full text-soft-pink transition-opacity duration-500"
      :class="painted || open ? 'opacity-0' : 'opacity-100'"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M36 20c-6-9-19-12-24-6-3.6 4.4 1.4 11.6 8 10.4 5.4-1 11-4.4 16-4.4" />
        <path d="M36 20c6-9 19-12 24-6 3.6 4.4-1.4 11.6-8 10.4-5.4-1-11-4.4-16-4.4" />
        <path d="M36 20c-2.4 6.6-6.5 12.6-10.5 15.6" />
        <path d="M36 20c2.4 6.6 6.5 12.6 10.5 15.6" />
      </g>
      <circle cx="36" cy="20" r="3.2" fill="currentColor" />
    </svg>
  </div>
</template>
