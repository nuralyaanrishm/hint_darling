<script setup lang="ts">
import { computed } from "vue";

type Tone = "rose" | "sage" | "deep";

const props = withDefaults(
  defineProps<{
    /** Oldest to newest. Empty and all-zero series both render a flat line. */
    points: number[];
    label: string;
    tone?: Tone;
    /** Human-readable total for the accessible summary (e.g. money). */
    summaryValue?: string;
  }>(),
  {
    tone: "rose",
    summaryValue: "",
  },
);

const WIDTH = 120;
const HEIGHT = 36;
const PAD = 3;

const max = computed(() => Math.max(1, ...props.points));

const coords = computed(() => {
  const count = props.points.length;
  const step = count > 1 ? (WIDTH - PAD * 2) / (count - 1) : 0;

  return props.points.map((value, index) => {
    const x = PAD + index * step;
    const y = HEIGHT - PAD - (value / max.value) * (HEIGHT - PAD * 2);
    return [x, y] as const;
  });
});

const linePath = computed(() =>
  coords.value
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`,
    )
    .join(" "),
);

const areaPath = computed(() => {
  const last = coords.value[coords.value.length - 1];
  if (!last) {
    return "";
  }

  return `${linePath.value} L${last[0].toFixed(2)} ${HEIGHT - PAD} L${PAD} ${HEIGHT - PAD} Z`;
});

const toneClass = computed(() => {
  if (props.tone === "sage") {
    return "text-sage-deep";
  }

  return props.tone === "deep" ? "text-rose-deep" : "text-rose";
});

const summary = computed(() => {
  const total = props.summaryValue
    ? props.summaryValue
    : String(props.points.reduce((sum, value) => sum + value, 0));

  return `${props.label}: ${total} over the last ${props.points.length} days`;
});
</script>

<template>
  <svg
    :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
    role="img"
    :aria-label="summary"
    preserveAspectRatio="none"
    class="h-10 w-full"
  >
    <path
      :d="areaPath"
      fill="currentColor"
      class="opacity-10"
      :class="toneClass"
    />
    <path
      :d="linePath"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
      :class="toneClass"
    />
  </svg>
</template>
