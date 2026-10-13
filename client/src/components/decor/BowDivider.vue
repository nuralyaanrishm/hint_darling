<script setup lang="ts">
// A delicate ribbon/bow divider used between sections.
</script>

<template>
  <div class="flex items-center justify-center gap-4 text-soft-pink" aria-hidden="true">
    <span class="h-px w-16 bg-gradient-to-r from-transparent to-soft-pink/60 sm:w-28" />
    <svg
      width="72"
      height="40"
      viewBox="0 0 72 40"
      fill="none"
      class="shrink-0"
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
    <span class="h-px w-16 bg-gradient-to-l from-transparent to-soft-pink/60 sm:w-28" />
  </div>
</template>
