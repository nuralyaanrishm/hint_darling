<script setup lang="ts">
import { RouterView } from "vue-router";
import TheNavbar from "@/components/layout/TheNavbar.vue";
import TheFooter from "@/components/layout/TheFooter.vue";
</script>

<template>
  <div class="flex min-h-screen flex-col bg-cream">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-rose focus:px-4 focus:py-2 focus:text-sm focus:text-white"
    >
      Skip to content
    </a>

    <TheNavbar />

    <main id="main" class="flex-1">
      <RouterView />
    </main>

    <TheFooter />
  </div>
</template>
