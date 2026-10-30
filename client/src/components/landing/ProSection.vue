<script setup lang="ts">
import { computed } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import { useAuth } from "@/stores/auth";

const { user, isAuthenticated } = useAuth();

const isPro = computed(() => user.value?.plan === "PRO");

const proBenefits = [
  "Unlimited gifts on every wishlist",
  "See how many gifts have been claimed",
  "One payment, yours forever",
  "Secure FPX or card payment via ToyyibPay",
];
</script>

<template>
  <section id="pro" class="scroll-mt-24 bg-white/50">
    <div class="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <div class="mx-auto max-w-2xl space-y-4 text-center">
        <p class="text-xs uppercase tracking-[0.3em] text-rose">Plans</p>
        <h2 class="text-balance font-display text-4xl text-ink sm:text-5xl">
          A little more, for the big moments
        </h2>
        <p class="text-ink/70">
          Start free. Unlock Pro once and keep it forever.
        </p>
      </div>

      <div class="mt-12 grid gap-6 md:grid-cols-2">
        <BaseCard class="flex h-full flex-col">
          <p class="text-xs uppercase tracking-[0.25em] text-ink/50">Free</p>
          <p class="mt-4 font-display text-4xl text-ink">RM0</p>
          <p class="mt-1 text-sm text-ink/60">Always free</p>

          <ul class="mt-6 space-y-3 text-sm text-ink/75">
            <li class="flex items-start gap-3">
              <span
                class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blush/70 text-rose"
                aria-hidden="true"
              >
                ✓
              </span>
              Up to 5 gifts per wishlist
            </li>
            <li class="flex items-start gap-3">
              <span
                class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blush/70 text-rose"
                aria-hidden="true"
              >
                ✓
              </span>
              Share one beautiful link with guests
            </li>
            <li class="flex items-start gap-3">
              <span
                class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blush/70 text-rose"
                aria-hidden="true"
              >
                ✓
              </span>
              Guest claiming so nothing is bought twice
            </li>
          </ul>

          <div class="mt-auto pt-8">
            <BaseButton to="/register" variant="secondary" block>
              Start for free
            </BaseButton>
          </div>
        </BaseCard>

        <BaseCard
          elevated
          class="relative flex h-full flex-col border-rose/40 bg-blush/30"
        >
          <span
            class="absolute right-5 top-5 rounded-full bg-rose px-2.5 py-1 text-xs font-medium text-white"
          >
            Pro
          </span>
          <p class="text-xs uppercase tracking-[0.25em] text-rose-deep">Pro</p>
          <p class="mt-4 font-display text-4xl text-ink">RM1</p>
          <p class="mt-1 text-sm text-ink/60">One payment, yours forever</p>

          <ul class="mt-6 space-y-3 text-sm text-ink/75">
            <li
              v-for="benefit in proBenefits"
              :key="benefit"
              class="flex items-start gap-3"
            >
              <span
                class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-sage-deep"
                aria-hidden="true"
              >
                ✓
              </span>
              {{ benefit }}
            </li>
          </ul>

          <div class="mt-auto pt-8">
            <BaseButton v-if="isPro" to="/dashboard" block>
              View your Pro dashboard
            </BaseButton>
            <BaseButton
              v-else-if="isAuthenticated"
              to="/dashboard"
              block
            >
              Unlock Pro in your dashboard
            </BaseButton>
            <BaseButton v-else to="/register" block>
              Create your wishlist
            </BaseButton>
          </div>
        </BaseCard>
      </div>
    </div>
  </section>
</template>
