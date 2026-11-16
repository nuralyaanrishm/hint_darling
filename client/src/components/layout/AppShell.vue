<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import ProfileMenu from "@/components/layout/ProfileMenu.vue";
import TheFooter from "@/components/layout/TheFooter.vue";
import HeartIcon from "@/components/decor/HeartIcon.vue";

const route = useRoute();

const drawerOpen = ref(false);
const drawerPanel = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

function openDrawer() {
  previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  drawerOpen.value = true;
}

function closeDrawer() {
  drawerOpen.value = false;
}

watch(drawerOpen, (isOpen) => {
  if (typeof document === "undefined") return;

  document.body.style.overflow = isOpen ? "hidden" : "";

  if (isOpen) {
    requestAnimationFrame(() => {
      const target =
        drawerPanel.value?.querySelector<HTMLElement>(
          "a[href], button:not([disabled])",
        ) ?? drawerPanel.value;
      target?.focus();
    });
  } else {
    previouslyFocused?.focus();
  }
});

watch(
  () => route.fullPath,
  () => closeDrawer(),
);

function onResize() {
  if (drawerOpen.value && window.innerWidth >= 1024) {
    closeDrawer();
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!drawerOpen.value) return;

  if (event.key === "Escape") {
    closeDrawer();
    return;
  }

  if (event.key !== "Tab" || !drawerPanel.value) return;

  const focusables = Array.from(
    drawerPanel.value.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled])",
    ),
  ).filter((element) => element.offsetParent !== null);

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("resize", onResize);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  window.removeEventListener("resize", onResize);
  document.body.style.overflow = "";
});
</script>

<template>
  <div class="min-h-screen bg-cream lg:flex">
    <!-- Desktop sidebar -->
    <aside
      class="hidden border-r border-blush/70 bg-white/70 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:overflow-y-auto"
    >
      <AppSidebar />
    </aside>

    <div class="flex min-h-screen min-w-0 flex-1 flex-col">
      <!-- Slim top bar: page chrome on mobile, account menu everywhere -->
      <header
        class="sticky top-0 z-40 border-b border-blush/70 bg-cream/85 backdrop-blur-md"
      >
        <div
          class="flex h-16 items-center justify-between gap-4 px-5 sm:px-8 lg:h-20 lg:justify-end"
        >
          <div class="flex min-w-0 items-center gap-3 lg:hidden">
            <button
              type="button"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blush text-ink transition-colors hover:bg-blush/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
              :aria-expanded="drawerOpen"
              aria-controls="app-drawer"
              aria-label="Open navigation"
              @click="openDrawer"
            >
              <svg
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
            </button>

            <RouterLink
              to="/"
              class="inline-flex min-w-0 items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
              aria-label="Hint, Darling home"
            >
              <HeartIcon
                :size="16"
                class="shrink-0 text-soft-pink"
                aria-hidden="true"
              />
              <span class="truncate font-display text-xl text-ink">
                Hint, Darling
              </span>
            </RouterLink>
          </div>

          <ProfileMenu />
        </div>
      </header>

      <main id="main" class="flex-1">
        <slot />
      </main>

      <TheFooter />
    </div>

    <!-- Mobile drawer -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="drawerOpen" class="fixed inset-0 z-[60] lg:hidden">
          <div
            class="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            aria-hidden="true"
            @click="closeDrawer"
          ></div>

          <div
            id="app-drawer"
            ref="drawerPanel"
            tabindex="-1"
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            class="drawer-panel absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto border-r border-blush/70 bg-cream shadow-card focus:outline-none"
          >
            <AppSidebar
              dismissible
              @navigate="closeDrawer"
              @close="closeDrawer"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.24s ease;
}

.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.28s var(--ease-gentle, ease);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active,
  .drawer-leave-active,
  .drawer-enter-active .drawer-panel,
  .drawer-leave-active .drawer-panel {
    transition: none;
  }
}
</style>
