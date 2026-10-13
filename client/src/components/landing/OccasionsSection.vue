<script setup lang="ts">
import BaseCard from "@/components/ui/BaseCard.vue";
import BaseButton from "@/components/ui/BaseButton.vue";

interface Occasion {
  name: string;
  text: string;
  paths: string[];
  tone: "blush" | "sage";
}

const occasions: Occasion[] = [
  {
    name: "Weddings",
    text: "A registry as elegant as the day you say “I do”.",
    tone: "blush",
    paths: [
      "M10 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z",
      "M16 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z",
    ],
  },
  {
    name: "Birthdays",
    text: "Wishlists for every age and every candle.",
    tone: "sage",
    paths: [
      "M4 20h16",
      "M5 20v-5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5",
      "M12 13V9",
      "M12 6c1 0 1.5-.8 1.5-1.5S12 2 12 2s-1.5 1.8-1.5 2.5S11 6 12 6Z",
    ],
  },
  {
    name: "Engagements",
    text: "Celebrate the yes with a shared little list.",
    tone: "blush",
    paths: [
      "M6 3h12l3 5-9 13L3 8Z",
      "M3 8h18",
      "M12 21 9 8l3-5 3 5-3 13",
    ],
  },
  {
    name: "Graduations",
    text: "Mark the milestone with gifts they'll truly use.",
    tone: "sage",
    paths: [
      "M22 10 12 5 2 10l10 5 10-5Z",
      "M6 12v5c0 1 2.7 2 6 2s6-1 6-2v-5",
    ],
  },
  {
    name: "Housewarmings",
    text: "Help them feather a brand-new nest.",
    tone: "blush",
    paths: ["M4 11 12 4l8 7", "M6 10v10h12V10", "M10 20v-6h4v6"],
  },
];
</script>

<template>
  <section id="occasions" class="scroll-mt-24">
    <div class="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <div class="mx-auto max-w-2xl space-y-4 text-center">
        <p class="text-xs uppercase tracking-[0.3em] text-rose">Occasions</p>
        <h2 class="text-balance font-display text-4xl text-ink sm:text-5xl">
          For every moment worth celebrating
        </h2>
        <p class="text-ink/70">
          Whatever the occasion, a Hint, Darling wishlist makes giving feel
          thoughtful and effortless.
        </p>
      </div>

      <div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <BaseCard
          v-for="occasion in occasions"
          :key="occasion.name"
          class="h-full text-left transition-transform duration-300 hover:-translate-y-1 motion-reduce:hover:translate-y-0"
        >
          <span
            class="flex h-12 w-12 items-center justify-center rounded-full"
            :class="occasion.tone === 'blush' ? 'bg-blush/60 text-rose' : 'bg-sage text-sage-deep'"
            aria-hidden="true"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path v-for="(d, i) in occasion.paths" :key="i" :d="d" />
            </svg>
          </span>
          <h3 class="mt-5 font-display text-2xl text-ink">{{ occasion.name }}</h3>
          <p class="mt-2 text-sm leading-relaxed text-ink/70">{{ occasion.text }}</p>
        </BaseCard>

        <!-- CTA tile fills the grid and gives a clear next step -->
        <BaseCard
          class="flex h-full flex-col items-start justify-center border-rose/30 bg-blush/40 text-left"
        >
          <h3 class="font-display text-2xl text-ink">Every little moment</h3>
          <p class="mt-2 text-sm leading-relaxed text-ink/70">
            Anniversaries, new babies, thank-yous, if it's worth celebrating,
            it's worth a wishlist.
          </p>
        </BaseCard>
      </div>
    </div>
  </section>
</template>
