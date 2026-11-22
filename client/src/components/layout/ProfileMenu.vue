<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import HeartIcon from "@/components/decor/HeartIcon.vue";
import { PLAN_CATALOG } from "@/lib/plans";
import { useAuth } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const { user, currentPlan, logout } = useAuth();

const open = ref(false);
const loggingOut = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);

const initials = computed(() => {
  const name = user.value?.name?.trim();
  if (!name) return "";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
});

const displayName = computed(() => user.value?.name?.trim() || "Your account");
const email = computed(() => user.value?.email ?? "");
const planLabel = computed(() => PLAN_CATALOG[currentPlan.value].shortLabel);

function closeMenu(restoreFocus = false) {
  if (!open.value) return;
  open.value = false;
  if (restoreFocus) {
    trigger.value?.focus();
  }
}

function toggleMenu() {
  if (open.value) {
    closeMenu();
    return;
  }
  open.value = true;
}

watch(open, (isOpen) => {
  if (isOpen) {
    requestAnimationFrame(() => {
      const firstItem =
        panel.value?.querySelector<HTMLElement>('[role="menuitem"]');
      (firstItem ?? panel.value)?.focus();
    });
  }
});

function onPanelKeydown(event: KeyboardEvent) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;

  const items = Array.from(
    panel.value?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([disabled])',
    ) ?? [],
  );
  if (!items.length) return;

  event.preventDefault();

  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  let nextIndex = 0;

  if (event.key === "End") {
    nextIndex = items.length - 1;
  } else if (event.key === "ArrowUp") {
    nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
  } else if (event.key === "ArrowDown") {
    nextIndex =
      currentIndex === -1 || currentIndex === items.length - 1
        ? 0
        : currentIndex + 1;
  }

  items[nextIndex]?.focus();
}

watch(
  () => route.fullPath,
  () => closeMenu(),
);

function onPointerDown(event: PointerEvent) {
  if (!open.value) return;
  if (
    root.value &&
    event.target instanceof Node &&
    !root.value.contains(event.target)
  ) {
    closeMenu();
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && open.value) {
    event.stopPropagation();
    closeMenu(true);
  }
}

async function onLogout() {
  if (loggingOut.value) return;

  loggingOut.value = true;

  try {
    await logout();
    await router.push("/login");
  } finally {
    loggingOut.value = false;
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onPointerDown);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div ref="root" class="relative">
    <button
      ref="trigger"
      type="button"
      class="group flex h-10 w-10 items-center justify-center rounded-full border border-rose/30 bg-blush/70 text-rose-deep transition-colors hover:border-rose hover:bg-blush focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
      :aria-expanded="open"
      :aria-controls="open ? 'account-menu' : undefined"
      aria-haspopup="menu"
      :aria-label="`Account menu for ${displayName}`"
      @click="toggleMenu"
    >
      <span v-if="initials" class="font-display text-base leading-none">
        {{ initials }}
      </span>
      <HeartIcon v-else :size="16" />
    </button>

    <Transition name="menu">
      <div
        v-if="open"
        id="account-menu"
        ref="panel"
        tabindex="-1"
        role="menu"
        aria-label="Account"
        class="absolute right-0 top-full z-50 mt-2 w-60 origin-top-right rounded-2xl border border-blush bg-cream p-2 shadow-card focus:outline-none"
        @keydown="onPanelKeydown"
      >
        <div class="flex items-center gap-3 rounded-xl bg-blush/40 px-3 py-3">
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 font-display text-base text-rose-deep"
            aria-hidden="true"
          >
            <template v-if="initials">{{ initials }}</template>
            <HeartIcon v-else :size="16" />
          </span>
          <div class="min-w-0">
            <p class="truncate font-display text-lg leading-tight text-ink">
              {{ displayName }}
            </p>
            <p class="truncate text-xs text-ink/60">{{ email }}</p>
          </div>
        </div>

        <div class="mt-1.5 flex items-center px-3 pb-1 pt-2">
          <span
            class="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-rose-deep"
          >
            {{ planLabel }}
          </span>
        </div>

        <RouterLink
          to="/dashboard"
          role="menuitem"
          class="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink/80 transition-colors hover:bg-blush/40 hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose"
          @click="closeMenu()"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="3.4" />
            <path d="M4.8 20c.7-3.5 3.6-5.6 7.2-5.6s6.5 2.1 7.2 5.6" />
          </svg>
          Me
        </RouterLink>

        <RouterLink
          to="/account"
          role="menuitem"
          class="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink/80 transition-colors hover:bg-blush/40 hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose"
          @click="closeMenu()"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3.2" />
            <path
              d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
            />
          </svg>
          Account settings
        </RouterLink>

        <div class="my-1 border-t border-blush/70" role="separator"></div>

        <button
          type="button"
          role="menuitem"
          :disabled="loggingOut"
          class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-ink/80 transition-colors hover:bg-blush/40 hover:text-rose-deep disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose"
          @click="onLogout"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M15 5h3.2c.4 0 .8.4.8.8v12.4c0 .4-.4.8-.8.8H15" />
            <path d="M10 8l-4 4 4 4M6 12h9" />
          </svg>
          {{ loggingOut ? "Logging out…" : "Log out" }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.menu-enter-active,
.menu-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s var(--ease-gentle, ease);
}

.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-0.25rem) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .menu-enter-active,
  .menu-leave-active {
    transition: none;
  }
}
</style>
