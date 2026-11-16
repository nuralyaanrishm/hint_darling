<script setup lang="ts">
import { computed } from "vue";
import { RouterView, useRoute } from "vue-router";
import AppShell from "@/components/layout/AppShell.vue";
import TheNavbar from "@/components/layout/TheNavbar.vue";
import TheFooter from "@/components/layout/TheFooter.vue";
import { useAuth } from "@/stores/auth";

const route = useRoute();
const { isAuthenticated } = useAuth();

const useAppShell = computed(
  () => isAuthenticated.value && route.meta.layout === "app",
);
</script>

<template>
  <div class="min-h-screen bg-cream">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-rose focus:px-4 focus:py-2 focus:text-sm focus:text-white"
    >
      Skip to content
    </a>

    <AppShell v-if="useAppShell">
      <RouterView />
    </AppShell>

    <div v-else class="flex min-h-screen flex-col bg-cream">
      <TheNavbar />

      <main id="main" class="flex-1">
        <RouterView />
      </main>

      <TheFooter />
    </div>
  </div>
</template>
