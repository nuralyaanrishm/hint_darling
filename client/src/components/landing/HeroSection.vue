<script setup lang="ts">
import BaseButton from "@/components/ui/BaseButton.vue";
import HeartIcon from "@/components/decor/HeartIcon.vue";
import FloralSprig from "@/components/decor/FloralSprig.vue";
</script>

<template>
  <section class="relative overflow-hidden">
    <!-- Soft ambient glows -->
    <div
      class="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-soft-pink/30 blur-3xl"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute -right-20 top-40 h-80 w-80 rounded-full bg-sage/40 blur-3xl"
      aria-hidden="true"
    />

    <div
      class="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-12"
    >
      <div class="space-y-7 text-center lg:text-left">
        <p
          class="inline-flex items-center gap-2 rounded-full border border-blush bg-white/70 px-4 py-1.5 text-xs uppercase tracking-[0.25em] text-rose"
        >
          <HeartIcon :size="12" />
          Wishlists &amp; gifting, beautifully coordinated
        </p>

        <h1
          class="text-balance font-display text-5xl leading-[1.05] text-ink sm:text-6xl lg:text-7xl"
        >
          The art of giving,
          <span class="text-rose">without the guesswork.</span>
        </h1>

        <p class="mx-auto max-w-md text-lg leading-relaxed text-ink/70 lg:mx-0">
          Create a wishlist for your occasion, share one link with friends and
          family, and let them coordinate gifts between themselves, so nothing
          is ever bought twice.
        </p>

        <div
          class="flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
        >
          <BaseButton to="/create" size="lg">Create Your Wishlist</BaseButton>
          <BaseButton href="#how-it-works" variant="secondary" size="lg">
            See How It Works
          </BaseButton>
        </div>

        
      </div>

      <!-- Decorative hero composition -->
      <div class="relative mx-auto w-full max-w-md">
        <div
          class="relative rounded-[2.5rem] border border-blush bg-white/70 p-6 shadow-card backdrop-blur-sm"
        >
          <div
            class="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-blush/70 to-cream px-8 py-12 text-center"
          >
            <FloralSprig
              :size="52"
              class="absolute left-4 top-4 text-sage-deep/70"
            />
            <FloralSprig
              :size="52"
              flip
              class="absolute bottom-4 right-4 text-sage-deep/70"
            />

            <svg
              width="120"
              height="66"
              viewBox="0 0 72 40"
              fill="none"
              class="mx-auto text-soft-pink"
              aria-hidden="true"
            >
              <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <path d="M36 20c-6-9-19-12-24-6-3.6 4.4 1.4 11.6 8 10.4 5.4-1 11-4.4 16-4.4" />
                <path d="M36 20c6-9 19-12 24-6 3.6 4.4-1.4 11.6-8 10.4-5.4-1-11-4.4-16-4.4" />
                <path d="M36 20c-2.4 6.6-6.5 12.6-10.5 15.6" />
                <path d="M36 20c2.4 6.6 6.5 12.6 10.5 15.6" />
              </g>
              <circle cx="36" cy="20" r="3.2" fill="currentColor" />
            </svg>

            <p class="mt-4 font-display text-4xl text-ink">Hint, Darling</p>
            <p class="mt-1 text-xs uppercase tracking-[0.3em] text-rose">
              A wishlist by you
            </p>
          </div>

          <div class="mt-5 flex items-center justify-between text-left">
          </div>
        </div>

        <!-- Floating accents -->
        <div
          class="absolute -left-4 top-10 hidden rounded-full border border-blush bg-white/90 px-4 py-2 text-xs text-rose shadow-soft sm:block"
          aria-hidden="true"
        >
          Weddings
        </div>
        <div
          class="absolute -right-4 bottom-12 hidden rounded-full border border-sage bg-white/90 px-4 py-2 text-xs text-sage-deep shadow-soft sm:block"
          aria-hidden="true"
        >
          Birthdays
        </div>
      </div>
    </div>
  </section>
</template>
