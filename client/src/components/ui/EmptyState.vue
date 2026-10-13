<script setup lang="ts">
import BowDivider from "@/components/decor/BowDivider.vue";

withDefaults(
  defineProps<{
    title: string;
    message: string;
  }>(),
  {},
);
</script>

<template>
  <div
    class="rounded-[2.5rem] border border-blush bg-white/70 px-8 py-12 text-center shadow-soft"
  >
    <div class="mx-auto mb-6 max-w-xs">
      <BowDivider />
    </div>
    <h3 class="font-display text-2xl text-ink">{{ title }}</h3>
    <p class="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink/70">
      {{ message }}
    </p>
    <div v-if="$slots.action" class="mt-6 flex justify-center">
      <slot name="action" />
    </div>
  </div>
</template>
