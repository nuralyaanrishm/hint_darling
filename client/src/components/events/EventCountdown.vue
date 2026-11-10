<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  compactCountdown,
  countdownParts,
  formatStartsAt,
} from "@/lib/eventTiming";

const props = withDefaults(
  defineProps<{
    /** Absolute ISO instant the celebration starts. */
    startsAt: string;
    /** Server time from the same payload; corrects a skewed device clock. */
    serverNow?: string | null;
    /** `full` is the hero card on the public page, `compact` an inline chip. */
    variant?: "full" | "compact";
  }>(),
  { serverNow: null, variant: "full" },
);

const emit = defineEmits<{ finished: [] }>();

const targetMs = computed(() => new Date(props.startsAt).getTime());
const isValid = computed(() => !Number.isNaN(targetMs.value));

const nowMs = ref(Date.now());
const skewMs = ref(0);
const announcedFinished = ref(false);

const remainingMs = computed(() =>
  Math.max(0, targetMs.value - (nowMs.value + skewMs.value)),
);
const closed = computed(
  () => !isValid.value || remainingMs.value <= 0,
);

const parts = computed(() => countdownParts(remainingMs.value));

const units = computed(() => [
  { label: "days", value: parts.value.days, pad: false },
  { label: "hrs", value: parts.value.hours, pad: true },
  { label: "min", value: parts.value.minutes, pad: true },
  { label: "sec", value: parts.value.seconds, pad: true },
]);

const compactLabel = computed(() => compactCountdown(remainingMs.value));
const absoluteLabel = computed(() =>
  isValid.value ? formatStartsAt(props.startsAt) : "",
);

function syncClock() {
  nowMs.value = Date.now();
  const server = props.serverNow ? new Date(props.serverNow).getTime() : NaN;
  // Treat the payload's timestamp as "now" for the server; a device clock that
  // runs fast or slow then can't show the countdown hitting zero early.
  skewMs.value = Number.isNaN(server) ? 0 : server - Date.now();
}

function tick() {
  nowMs.value = Date.now();
  if (!isValid.value) return;

  if (remainingMs.value <= 0 && !announcedFinished.value) {
    announcedFinished.value = true;
    emit("finished");
  }
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") syncClock();
}

let timer: ReturnType<typeof setInterval> | undefined;

watch(
  () => props.serverNow,
  () => syncClock(),
);

onMounted(() => {
  syncClock();
  tick();
  // One second is plenty: the display never shows tenths.
  timer = setInterval(tick, 1_000);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", syncClock);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  timer = undefined;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("focus", syncClock);
});

function pad(value: number, shouldPad: boolean): string {
  return shouldPad ? String(value).padStart(2, "0") : String(value);
}
</script>

<template>
  <div v-if="isValid">
    <!-- Full hero card (public wishlist) -->
    <div
      v-if="variant === 'full'"
      class="rounded-[1.75rem] border border-blush bg-white/70 px-6 py-5 text-center shadow-soft"
    >
      <p class="text-[11px] uppercase tracking-[0.28em] text-rose/80">
        {{ closed ? "Gifting closed" : "Gifting closes when the celebration starts" }}
      </p>

      <p v-if="closed" class="mt-3 font-display text-2xl text-ink">
        The celebration has started 🎉
      </p>

      <template v-else>
        <div
          class="mt-4 flex items-end justify-center gap-3 sm:gap-5"
          role="timer"
          aria-live="off"
        >
          <div
            v-for="unit in units"
            :key="unit.label"
            class="flex min-w-[3.25rem] flex-col items-center"
          >
            <span
              class="font-display text-4xl tabular-nums text-ink sm:text-5xl"
            >
              {{ pad(unit.value, unit.pad) }}
            </span>
            <span
              class="mt-1 text-[10px] uppercase tracking-[0.18em] text-ink/50"
            >
              {{ unit.label }}
            </span>
          </div>
        </div>

        <p class="mt-4 text-xs text-ink/50">
          Gifts can be reserved until {{ absoluteLabel }}
        </p>
      </template>

      <p class="sr-only">
        {{ closed ? "Gifts can no longer be reserved." : `The event starts ${absoluteLabel}.` }}
      </p>
    </div>

    <!-- Compact chip (owner pages) -->
    <span
      v-else
      class="inline-flex items-center gap-1.5 rounded-full border border-blush bg-white/70 px-3 py-1 text-xs text-ink/70"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span v-if="closed">Gifting closed</span>
      <span v-else class="tabular-nums">
        Gifts close in {{ compactLabel }}
      </span>
      <span class="sr-only">
        {{ closed ? "The event has started." : `The event starts ${absoluteLabel}.` }}
      </span>
    </span>
  </div>
</template>
