<script setup lang="ts">
import { computed } from "vue";

interface FunnelStep {
  label: string;
  value: number;
}

const props = defineProps<{
  /** Ordered from the widest stage to the narrowest. */
  steps: FunnelStep[];
}>();

const baseline = computed(() => Math.max(1, props.steps[0]?.value ?? 0));

const rows = computed(() =>
  props.steps.map((step, index) => {
    const previous =
      index === 0 ? step.value : (props.steps[index - 1]?.value ?? 0);

    return {
      label: step.label,
      value: step.value,
      width: Math.min(
        100,
        Math.max(step.value > 0 ? 2 : 0, (step.value / baseline.value) * 100),
      ),
      conversion:
        index === 0 || previous === 0
          ? null
          : Math.round((step.value / previous) * 100),
    };
  }),
);
</script>

<template>
  <ol class="space-y-4">
    <li v-for="row in rows" :key="row.label">
      <div class="flex items-baseline justify-between gap-3">
        <p class="text-sm font-medium text-ink">{{ row.label }}</p>
        <p class="text-xs text-ink/60">
          <span class="font-display text-lg text-ink">{{ row.value }}</span>
          <span v-if="row.conversion !== null" class="ml-2">
            {{ row.conversion }}% of previous
          </span>
        </p>
      </div>
      <div
        class="mt-2 h-2.5 overflow-hidden rounded-full bg-blush/50"
        role="presentation"
      >
        <div
          class="h-full rounded-full bg-rose/70 transition-[width] duration-700 ease-out motion-reduce:transition-none"
          :style="{ width: `${row.width}%` }"
        />
      </div>
    </li>
  </ol>
</template>
