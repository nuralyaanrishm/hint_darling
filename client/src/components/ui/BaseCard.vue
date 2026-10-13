<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Use the deeper shadow for focal cards. */
    elevated?: boolean;
    /** Remove default padding when the card manages its own layout. */
    flush?: boolean;
  }>(),
  {
    elevated: false,
    flush: false,
  },
);
</script>

<template>
  <div
    class="rounded-3xl border border-blush bg-white/80 backdrop-blur-sm"
    :class="[elevated ? 'shadow-card' : 'shadow-soft', flush ? '' : 'p-6']"
  >
    <slot />
  </div>
</template>
