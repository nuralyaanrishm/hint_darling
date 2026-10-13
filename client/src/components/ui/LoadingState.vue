<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string;
    rows?: number;
  }>(),
  {
    label: "Loading…",
    rows: 3,
  },
);
</script>

<template>
  <div role="status" aria-live="polite" :aria-label="label" class="space-y-4">
    <span class="sr-only">{{ label }}</span>
    <div
      v-for="row in rows"
      :key="row"
      class="animate-pulse rounded-3xl border border-blush bg-white/70 p-6"
    >
      <div class="h-4 w-1/3 rounded-full bg-blush/70" />
      <div class="mt-3 h-3 w-2/3 rounded-full bg-blush/50" />
      <div class="mt-2 h-3 w-1/2 rounded-full bg-blush/40" />
    </div>
  </div>
</template>
