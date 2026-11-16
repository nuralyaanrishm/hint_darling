<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import HeartIcon from "@/components/decor/HeartIcon.vue";
import { useAuth } from "@/stores/auth";

const props = withDefaults(defineProps<{ dismissible?: boolean }>(), {
  dismissible: false,
});

const emit = defineEmits<{ navigate: []; close: [] }>();

const route = useRoute();
const { isAdmin } = useAuth();

type NavIcon = "user" | "gift" | "shield";

interface NavItem {
  label: string;
  to: string;
  icon: NavIcon;
  match: string[];
}

const navItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    {
      label: "Me",
      to: "/dashboard",
      icon: "user",
      match: ["/dashboard", "/events", "/billing"],
    },
    {
      label: "My gifts",
      to: "/claims",
      icon: "gift",
      match: ["/claims"],
    },
  ];

  if (isAdmin.value) {
    items.push({
      label: "Admin",
      to: "/admin",
      icon: "shield",
      match: ["/admin"],
    });
  }

  return items;
});

function isActive(item: NavItem): boolean {
  return item.match.some(
    (prefix) => route.path === prefix || route.path.startsWith(`${prefix}/`),
  );
}
</script>

<template>
  <div class="flex min-h-full flex-col px-5 py-6">
    <div class="flex items-center justify-between gap-3">
      <RouterLink
        to="/"
        class="group inline-flex items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        aria-label="Hint, Darling home"
        @click="emit('navigate')"
      >
        <HeartIcon
          :size="17"
          class="shrink-0 text-soft-pink transition-colors group-hover:text-rose"
        />
        <span class="font-display text-xl tracking-wide text-ink">
          Hint, Darling
        </span>
      </RouterLink>

      <button
        v-if="props.dismissible"
        type="button"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blush text-ink/60 transition-colors hover:bg-blush/40 hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose lg:hidden"
        aria-label="Close navigation"
        @click="emit('close')"
      >
        <svg
          width="15"
          height="15"
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
    </div>

    <div class="mt-7">
      <BaseButton to="/events/new" block size="sm" @click="emit('navigate')">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Create event
      </BaseButton>
    </div>

    <nav class="mt-7 flex-1" aria-label="Main">
      <p
        class="px-3 text-[10px] font-medium uppercase tracking-[0.26em] text-ink/40"
      >
        Your space
      </p>

      <ul class="mt-2 flex flex-col gap-1">
        <li v-for="item in navItems" :key="item.to">
          <RouterLink
            :to="item.to"
            :aria-current="isActive(item) ? 'page' : undefined"
            class="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
            :class="
              isActive(item)
                ? 'bg-blush/60 font-medium text-rose-deep'
                : 'text-ink/75 hover:bg-blush/30 hover:text-rose'
            "
            @click="emit('navigate')"
          >
            <span
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors"
              :class="
                isActive(item)
                  ? 'bg-white/70 text-rose-deep'
                  : 'bg-blush/40 text-rose/80 group-hover:bg-white/70'
              "
              aria-hidden="true"
            >
              <svg
                v-if="item.icon === 'user'"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="8" r="3.4" />
                <path d="M4.8 20c.7-3.5 3.6-5.6 7.2-5.6s6.5 2.1 7.2 5.6" />
              </svg>
              <svg
                v-else-if="item.icon === 'gift'"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M4 10h16v9.2a.8.8 0 0 1-.8.8H4.8a.8.8 0 0 1-.8-.8z" />
                <path d="M3 7h18v3H3zM12 7v13" />
                <path d="M12 7C10.7 4.3 9.6 3 8.2 3 6.9 3 6 3.8 6 4.9 6 6.1 7 7 8.7 7H12zM12 7c1.3-2.7 2.4-4 3.8-4 1.3 0 2.2.8 2.2 1.9C18 6.1 17 7 15.3 7H12z" />
              </svg>
              <svg
                v-else
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 3 5 6v5c0 4.4 2.9 8.2 7 9.4 4.1-1.2 7-5 7-9.4V6z" />
                <path d="m9.2 12 1.9 1.9 3.7-3.7" />
              </svg>
            </span>
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>

    <p class="mt-8 px-3 text-[11px] leading-relaxed text-ink/35">
      Gifts, without the guesswork.
    </p>
  </div>
</template>
