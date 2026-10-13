<script setup lang="ts">
import BaseButton from "@/components/ui/BaseButton.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
</script>

<template>
  <section class="flex min-h-[70vh] items-center justify-center px-5 py-20 sm:px-8">
    <div class="w-full max-w-xl text-center">
      <p class="font-display text-7xl text-blush">404</p>
      <h1 class="mt-4 font-display text-4xl text-ink sm:text-5xl">
        This page slipped away
      </h1>
      <div class="my-8">
        <BowDivider />
      </div>
      <p class="text-ink/70">
        We couldn't find the page you were looking for. Let's get you back to
        something lovely.
      </p>
      <BaseButton to="/" class="mt-8">Back to home</BaseButton>
    </div>
  </section>
</template>
