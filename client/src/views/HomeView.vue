<script setup lang="ts">
import HeroSection from "@/components/landing/HeroSection.vue";
import WishlistPreview from "@/components/landing/WishlistPreview.vue";
import HowItWorks from "@/components/landing/HowItWorks.vue";
import OccasionsSection from "@/components/landing/OccasionsSection.vue";
import ProSection from "@/components/landing/ProSection.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
</script>

<template>
  <HeroSection />

  <div class="mx-auto max-w-6xl px-5 sm:px-8">
    <BowDivider />
  </div>

  <WishlistPreview />

  <HowItWorks />

  <OccasionsSection />

  <ProSection />

  <!-- Closing call to action -->
  <!--<section class="relative overflow-hidden">
    <div class="mx-auto max-w-3xl px-5 py-20 text-center sm:px-8">
      <div class="rounded-[2.5rem] border border-blush bg-blush/40 px-8 py-14">
        <h2 class="text-balance font-display text-4xl text-ink sm:text-5xl">
          Ready to make giving feel effortless?
        </h2>
        <p class="mx-auto mt-4 max-w-lg text-ink/70">
          Start your wishlist today and share it with the people who love you.
        </p>
        <div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <BaseButton to="/create" size="lg">Create Your Wishlist</BaseButton>
          <BaseButton href="#how-it-works" variant="secondary" size="lg">
            See How It Works
          </BaseButton>
        </div>
        
      </div>
    </div>
  </section>
  -->
</template>
