<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import BowDivider from "@/components/decor/BowDivider.vue";

const route = useRoute();

const title = computed(
  () => (route.meta.title as string | undefined) ?? "Coming soon",
);
const description = computed(
  () =>
    (route.meta.description as string | undefined) ??
    "This part of Hint, Darling isn't built yet.",
);
</script>

<template>
  <section class="flex min-h-[70vh] items-center justify-center px-5 py-20 sm:px-8">
    <div class="w-full max-w-xl text-center">
      <div class="rounded-[2.5rem] border border-blush bg-white/70 px-8 py-14 shadow-soft">
        <p class="text-xs uppercase tracking-[0.3em] text-rose">Hint, Darling</p>
        <h1 class="mt-4 font-display text-4xl text-ink sm:text-5xl">{{ title }}</h1>

        <div class="my-8">
          <BowDivider />
        </div>

        <p class="mx-auto max-w-md leading-relaxed text-ink/70">
          {{ description }}
        </p>

        <BaseButton to="/" variant="secondary" class="mt-8">
          Back to home
        </BaseButton>
      </div>
    </div>
  </section>
</template>
