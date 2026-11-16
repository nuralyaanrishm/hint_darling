<script setup lang="ts">
import { ref } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import HeartIcon from "@/components/decor/HeartIcon.vue";
import FloralSprig from "@/components/decor/FloralSprig.vue";
import BowRibbon from "@/components/decor/BowRibbon.vue";
import HeroScene from "@/components/decor/HeroScene.vue";
import WishlistPeek from "@/components/landing/WishlistPeek.vue";
import { HERO_GIFTS } from "@/lib/heroGifts";

/* `open` is the intent the button expresses; `revealed` is when the paper is
   actually clear. The scene decides that moment, so the wishlist never has to
   guess at its animation timing. `sceneReady` says whether the card is being
   drawn in 3D at all — it decides between objects and the readable list. */
const open = ref(false);
const revealed = ref(false);
const sceneReady = ref(false);

const toggle = () => {
  open.value = !open.value;
  if (!open.value) revealed.value = false;
};
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

      <!-- Hero card: a sealed card that unties to show what is inside -->
      <div class="relative mx-auto w-full max-w-md">
        <div
          class="relative rounded-[2.5rem] border border-blush bg-white/70 p-6 shadow-card backdrop-blur-sm"
        >
          <div
            class="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-blush/70 to-cream"
          >
            <div
              class="relative px-8 py-12 text-center transition-opacity duration-300 ease-[var(--ease-gentle)] motion-reduce:transition-none"
              :class="revealed ? 'opacity-0' : 'opacity-100'"
              :aria-hidden="revealed ? 'true' : undefined"
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

              <BowRibbon :painted="sceneReady" :open="open" />

              <!-- The lettering clears first, so the panel empties as the
                   ribbon retracts instead of leaving a headline floating. -->
              <div
                class="transition-opacity duration-300 ease-[var(--ease-gentle)] motion-reduce:transition-none"
                :class="open ? 'opacity-0' : 'opacity-100'"
              >
                <p class="mt-4 font-display text-4xl text-ink">Hint, Darling</p>
                <p class="mt-1 text-xs uppercase tracking-[0.3em] text-rose">
                  A wishlist by you
                </p>
              </div>
            </div>

            <HeroScene
              :open="open"
              @painted="sceneReady = true"
              @reveal="revealed = true"
            />

            <div
              id="hero-card-inside"
              class="absolute inset-0 transition-opacity duration-300 ease-[var(--ease-gentle)] motion-reduce:transition-none"
              :class="
                revealed
                  ? 'opacity-100'
                  : 'pointer-events-none opacity-0'
              "
              v-bind="revealed ? {} : { 'aria-hidden': 'true', inert: true }"
            >
              <WishlistPeek v-if="!sceneReady" />

              <div v-else class="flex h-full flex-col px-6 py-6 text-left">
                <p class="text-[10px] uppercase tracking-[0.22em] text-rose">
                  Inside
                </p>
                <p class="mt-1 font-display text-xl leading-tight text-ink">
                  Amelia's birthday
                </p>

                <ul class="mt-auto grid grid-cols-3 pb-1">
                  <li
                    v-for="gift in HERO_GIFTS"
                    :key="gift.id"
                    class="text-center"
                  >
                    <p
                      class="text-[9px] uppercase leading-tight tracking-[0.08em] text-ink/75"
                    >
                      {{ gift.label }}
                    </p>
                    <p
                      class="mt-1 text-[8.5px] uppercase tracking-[0.12em]"
                      :class="
                        gift.claimed ? 'text-sage-deep' : 'text-ink/50'
                      "
                    >
                      {{ gift.claimed ? "claimed" : "open" }}
                    </p>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div class="mt-5 flex items-center justify-center">
            <button
              type="button"
              :aria-expanded="open"
              aria-controls="hero-card-inside"
              class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-rose transition-colors hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
              @click="toggle"
            >
              {{ open ? "Tie it back" : "Peek inside" }}
              <svg
                width="9"
                height="6"
                viewBox="0 0 9 6"
                fill="none"
                class="transition-transform duration-300 motion-reduce:transition-none"
                :class="open ? 'rotate-180' : ''"
                aria-hidden="true"
              >
                <path
                  d="M1 1.5 4.5 5 8 1.5"
                  stroke="currentColor"
                  stroke-width="1.3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Floating accents, shed as the card opens: they would otherwise sit
             on top of the wishlist heading. -->
        <div
          class="absolute -left-4 top-10 hidden rounded-full border border-blush bg-white/90 px-4 py-2 text-xs text-rose shadow-soft transition duration-300 ease-[var(--ease-gentle)] motion-reduce:transition-none sm:block"
          :class="open ? 'pointer-events-none scale-95 opacity-0 delay-100' : 'opacity-100'"
          aria-hidden="true"
        >
          Weddings
        </div>
        <div
          class="absolute -right-4 bottom-12 hidden rounded-full border border-sage bg-white/90 px-4 py-2 text-xs text-sage-deep shadow-soft transition duration-300 ease-[var(--ease-gentle)] motion-reduce:transition-none sm:block"
          :class="open ? 'pointer-events-none scale-95 opacity-0 delay-150' : 'opacity-100'"
          aria-hidden="true"
        >
          Birthdays
        </div>
      </div>
    </div>
  </section>
</template>
