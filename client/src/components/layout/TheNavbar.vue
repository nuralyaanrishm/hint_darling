<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import HeartIcon from "@/components/decor/HeartIcon.vue";
import { useAuth } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const { isAuthenticated, user, logout } = useAuth();

const menuOpen = ref(false);
const loggingOut = ref(false);

const links = [
  { label: "How It Works", to: "/#how-it-works" },
  { label: "Occasions", to: "/#occasions" },
  { label: "Pro", to: "/#pro" },
];

const isPro = computed(() => user.value?.plan === "PRO");
const visibleLinks = computed(() =>
  isPro.value ? links.filter((link) => link.label !== "Pro") : links,
);

function closeMenu() {
  menuOpen.value = false;
}

async function onLogout() {
  closeMenu();
  loggingOut.value = true;
  try {
    await logout();
    await router.push("/login");
  } finally {
    loggingOut.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeMenu();
  }
}

watch(() => route.fullPath, closeMenu);
onMounted(() => document.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <header
    class="sticky top-0 z-50 border-b border-blush/70 bg-cream/85 backdrop-blur-md"
  >
    <nav
      class="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:h-20 sm:px-8"
      aria-label="Main"
    >
      <RouterLink
        to="/"
        class="group inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        aria-label="Hint, Darling home"
      >
        <HeartIcon :size="18" class="text-soft-pink transition-colors group-hover:text-rose" />
        <span class="font-display text-2xl tracking-wide text-ink sm:text-[1.7rem]">
          Hint, Darling
        </span>
      </RouterLink>

      <!-- Desktop navigation -->
      <div class="hidden items-center gap-8 md:flex">
        <RouterLink
          v-for="link in visibleLinks"
          :key="link.to"
          :to="link.to"
          class="text-sm text-ink/75 transition-colors hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          {{ link.label }}
        </RouterLink>

        <template v-if="isAuthenticated">
          <RouterLink
            to="/claims"
            class="text-sm text-ink/75 transition-colors hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            My Gifts
          </RouterLink>
          <RouterLink
            to="/dashboard"
            class="text-sm text-ink/75 transition-colors hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            Me
          </RouterLink>
          <RouterLink
            v-if="isPro"
            to="/dashboard"
            class="rounded-full bg-rose/10 px-2.5 py-1 text-xs font-medium text-rose-deep transition-colors hover:bg-rose/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            Pro
          </RouterLink>
          <RouterLink
            v-else
            to="/dashboard"
            class="rounded-full border border-rose/40 px-2.5 py-1 text-xs font-medium text-rose transition-colors hover:border-rose hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            Go Pro
          </RouterLink>
          <button
            type="button"
            :disabled="loggingOut"
            class="text-sm text-ink/75 transition-colors hover:text-rose disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
            @click="onLogout"
          >
            {{ loggingOut ? "Logging out…" : "Log out" }}
          </button>
        </template>

        <template v-else>
          <RouterLink
            to="/login"
            class="text-sm text-ink/75 transition-colors hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            Log In
          </RouterLink>
          <BaseButton to="/register" size="sm">Create Your Wishlist</BaseButton>
        </template>
      </div>

      <!-- Mobile menu toggle -->
      <button
        type="button"
        class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-blush text-ink transition-colors hover:bg-blush/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream md:hidden"
        :aria-expanded="menuOpen"
        aria-controls="mobile-menu"
        :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
        @click="menuOpen = !menuOpen"
      >
        <svg
          v-if="!menuOpen"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <svg
          v-else
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </nav>

    <!-- Mobile menu panel -->
    <div
      v-show="menuOpen"
      id="mobile-menu"
      class="border-t border-blush/70 bg-cream/95 px-5 pb-6 pt-4 md:hidden"
    >
      <div class="flex flex-col gap-1">
        <RouterLink
          v-for="link in visibleLinks"
          :key="link.to"
          :to="link.to"
          class="rounded-xl px-3 py-3 text-sm text-ink/80 transition-colors hover:bg-blush/40 hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose"
        >
          {{ link.label }}
        </RouterLink>

        <template v-if="isAuthenticated">
          <RouterLink
            to="/claims"
            class="rounded-xl px-3 py-3 text-sm text-ink/80 transition-colors hover:bg-blush/40 hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose"
          >
            My Gifts
          </RouterLink>
          <RouterLink
            to="/dashboard"
            class="rounded-xl px-3 py-3 text-sm text-ink/80 transition-colors hover:bg-blush/40 hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose"
          >
            Me
          </RouterLink>
          <RouterLink
            v-if="isPro"
            to="/dashboard"
            class="mx-3 w-fit rounded-full bg-rose/10 px-2.5 py-1 text-xs font-medium text-rose-deep transition-colors hover:bg-rose/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose"
          >
            Pro
          </RouterLink>
          <RouterLink
            v-else
            to="/dashboard"
            class="mx-3 w-fit rounded-full border border-rose/40 px-2.5 py-1 text-xs font-medium text-rose transition-colors hover:border-rose hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose"
          >
            Go Pro
          </RouterLink>
          <button
            type="button"
            :disabled="loggingOut"
            class="rounded-xl px-3 py-3 text-left text-sm text-ink/80 transition-colors hover:bg-blush/40 hover:text-rose disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose"
            @click="onLogout"
          >
            {{ loggingOut ? "Logging out…" : "Log out" }}
          </button>
        </template>

        <template v-else>
          <RouterLink
            to="/login"
            class="rounded-xl px-3 py-3 text-sm text-ink/80 transition-colors hover:bg-blush/40 hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose"
          >
            Log In
          </RouterLink>
          <BaseButton to="/register" block class="mt-3">Create Your Wishlist</BaseButton>
        </template>
      </div>
    </div>
  </header>
</template>
