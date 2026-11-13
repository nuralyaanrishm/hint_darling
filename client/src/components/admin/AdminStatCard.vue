<script setup lang="ts">
import { computed } from "vue";
import BaseCard from "@/components/ui/BaseCard.vue";

type Accent = "rose" | "sage" | "gold";

const props = withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    hint?: string;
    /** Thin rule along the top edge, used to group related metrics. */
    accent?: Accent;
  }>(),
  {
    hint: "",
    accent: "rose",
  },
);

const accentClasses: Record<Accent, string> = {
  rose: "bg-rose/60",
  sage: "bg-sage-deep/50",
  gold: "bg-plan-pro",
};

const barClass = computed(() => accentClasses[props.accent]);
</script>

<template>
  <BaseCard class="relative overflow-hidden">
    <span
      aria-hidden="true"
      class="absolute inset-x-0 top-0 h-1"
      :class="barClass"
    />
    <p class="text-xs uppercase tracking-[0.2em] text-ink/50">{{ label }}</p>
    <p class="mt-3 font-display text-4xl leading-none text-ink">{{ value }}</p>
    <p v-if="hint" class="mt-2 text-xs text-ink/55">{{ hint }}</p>
  </BaseCard>
</template>
