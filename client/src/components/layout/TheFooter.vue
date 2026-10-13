<script setup lang="ts">
import { RouterLink } from "vue-router";
import HeartIcon from "@/components/decor/HeartIcon.vue";

const footerLinks = [
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
];

const year = new Date().getFullYear();
</script>

<template>
  <footer class="border-t border-blush/70 bg-white/60">
    <div
      class="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-center md:justify-between"
    >
      <div class="max-w-xs space-y-3">
        <RouterLink
          to="/"
          class="inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          <HeartIcon :size="16" class="text-soft-pink" />
          <span class="font-display text-xl tracking-wide text-ink">Hint, Darling</span>
        </RouterLink>
      </div>

      <nav aria-label="Footer">
        <ul class="flex flex-wrap gap-x-8 gap-y-3">
          <li v-for="link in footerLinks" :key="link.to">
            <RouterLink
              :to="link.to"
              class="text-sm text-ink/70 transition-colors hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
            >
              {{ link.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>
    </div>

    <div class="border-t border-blush/60">
      <p class="mx-auto max-w-6xl px-5 py-5 text-xs text-ink/45 sm:px-8">
        © {{ year }} Hint, Darling. Powered by BuildWithAly.
      </p>
    </div>
  </footer>
</template>
