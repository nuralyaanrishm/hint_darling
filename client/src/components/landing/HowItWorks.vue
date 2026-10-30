<script setup lang="ts">
import BaseCard from "@/components/ui/BaseCard.vue";

const steps = [
  {
    number: "01",
    title: "Create",
    text: "Add the gifts you truly want and arrange them into a wishlist that feels like you.",
  },
  {
    number: "02",
    title: "Share",
    text: "Send one link or the QR code to your friends and family. No accounts, no fuss, just a lovely wishlist to browse.",
  },
  {
    number: "03",
    title: "Claim",
    text: "Guests claim the gifts they'll give, so every present is accounted for and nothing is ever bought twice.",
  },
];
</script>

<template>
  <section id="how-it-works" class="scroll-mt-24 bg-white/50">
    <div class="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <div class="mx-auto max-w-2xl space-y-4 text-center">
        <p class="text-xs uppercase tracking-[0.3em] text-rose">How it works</p>
        <h2 class="text-balance font-display text-4xl text-ink sm:text-5xl">
          Three gentle steps
        </h2>
        <p class="text-ink/70">
          From first idea to the perfect reveal. Hint, Darling keeps gifting
          graceful and simple.
        </p>
      </div>

      <ol class="mt-12 grid gap-6 md:grid-cols-3">
        <li v-for="step in steps" :key="step.number">
          <BaseCard class="h-full text-left">
            <div class="flex items-center justify-between">
              <span class="font-display text-5xl text-blush">{{ step.number }}</span>
              <span
                class="h-10 w-10 rounded-full bg-blush/50"
                aria-hidden="true"
              />
            </div>
            <h3 class="mt-6 font-display text-2xl text-ink">{{ step.title }}</h3>
            <p class="mt-3 text-sm leading-relaxed text-ink/70">{{ step.text }}</p>
          </BaseCard>
        </li>
      </ol>
    </div>
  </section>
</template>
