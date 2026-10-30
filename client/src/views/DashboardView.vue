<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import UnlockDialog from "@/components/billing/UnlockDialog.vue";
import ConfirmDialog from "@/components/ui/ConfirmDialog.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import EventCard from "@/components/events/EventCard.vue";
import {
  deleteEvent,
  getBilling,
  isApiError,
  listEvents,
  type BillingSummary,
  type EventSummary,
} from "@/lib/api";
import { useAuth } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const { user, logout } = useAuth();

const events = ref<EventSummary[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const loggingOut = ref(false);

const billing = ref<BillingSummary | null>(null);
const unlockOpen = ref(false);
const isPro = computed(() => user.value?.plan === "PRO");
const freeItemLimit = computed(() => billing.value?.freeItemLimit ?? 5);
const unlockPriceSen = computed(() => billing.value?.priceSen ?? 100);

const proUnlockedLabel = computed(() => {
  const value = billing.value?.proUnlockedAt ?? user.value?.proUnlockedAt ?? null;
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

function formatPrice(sen: number) {
  const amount = sen / 100;
  return `RM${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

async function loadBilling() {
  try {
    billing.value = await getBilling();
  } catch {
    // Plan details are a nicety; the API still enforces plan limits.
  }
}

function redirectToLogin() {
  void router.push({ name: "login", query: { redirect: route.fullPath } });
}

async function loadEvents() {
  loading.value = true;
  loadError.value = null;

  try {
    events.value = await listEvents();
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      redirectToLogin();
      return;
    }
    loadError.value = isApiError(error)
      ? error.message
      : "We couldn't load your events.";
  } finally {
    loading.value = false;
  }
}

async function onLogout() {
  loggingOut.value = true;
  try {
    await logout();
    await router.push("/login");
  } finally {
    loggingOut.value = false;
  }
}

const eventToDelete = ref<EventSummary | null>(null);
const deleteOpen = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);

function askDelete(target: EventSummary) {
  eventToDelete.value = target;
  deleteError.value = null;
  deleteOpen.value = true;
}

async function confirmDelete() {
  const target = eventToDelete.value;
  if (!target) return;

  deleting.value = true;
  deleteError.value = null;

  try {
    await deleteEvent(target.id);
    events.value = events.value.filter((item) => item.id !== target.id);
    deleteOpen.value = false;
    eventToDelete.value = null;
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      redirectToLogin();
      return;
    }
    deleteError.value = isApiError(error)
      ? error.message
      : "We couldn't delete this event.";
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  void loadEvents();
  void loadBilling();
});
</script>

<template>
  <section class="mx-auto max-w-5xl px-5 py-16 sm:px-8">
    <header
      class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <p class="text-xs uppercase tracking-[0.3em] text-rose">
          Host dashboard
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <h1 class="font-display text-4xl text-ink sm:text-5xl">
            Hello, {{ user?.name }}
          </h1>
          <span
            v-if="isPro"
            class="rounded-full bg-rose px-2.5 py-1 text-xs font-medium uppercase tracking-[0.18em] text-white"
          >
            Pro
          </span>
        </div>
        <p class="mt-2 text-sm text-ink/70">Signed in as {{ user?.email }}</p>
      </div>
    </header>

    <div class="my-10">
      <BowDivider />
    </div>

    <BaseCard elevated>
      <div
        class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-3">
            <span
              class="rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-[0.18em]"
              :class="
                isPro
                  ? 'bg-rose/10 text-rose-deep'
                  : 'bg-blush/70 text-ink/70'
              "
            >
              {{ isPro ? "Pro" : "Free" }}
            </span>
            <h2 class="font-display text-2xl text-ink">
              {{ isPro ? "Pro membership" : "Free plan" }}
            </h2>
          </div>

          <p v-if="isPro" class="mt-2 text-sm leading-relaxed text-ink/70">
            Unlimited gifts on every wishlist, with claim insights.
            <template v-if="proUnlockedLabel">
              Unlocked {{ proUnlockedLabel }}.
            </template>
            Thank you for supporting Hint, Darling.
          </p>
          <p v-else class="mt-2 text-sm leading-relaxed text-ink/70">
            Your wishlists hold up to {{ freeItemLimit }} gifts and claim
            insights are locked. Unlock Pro once to add unlimited gifts and see
            how many have been claimed.
          </p>
        </div>

        <BaseButton
          v-if="!isPro"
          size="sm"
          class="shrink-0"
          @click="unlockOpen = true"
        >
          Unlock Pro for {{ formatPrice(unlockPriceSen) }}
        </BaseButton>
      </div>

      <p class="mt-5 text-xs uppercase tracking-[0.2em] text-ink/45">
        {{ isPro ? "Your Pro benefits" : "What you'll unlock" }}
      </p>
      <ul class="mt-3 grid gap-2 text-sm text-ink/75 sm:grid-cols-2">
        <li class="flex items-start gap-2">
          <span
            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-sage-deep"
            aria-hidden="true"
          >
            ✓
          </span>
          Unlimited gifts on every wishlist
        </li>
        <li class="flex items-start gap-2">
          <span
            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-sage-deep"
            aria-hidden="true"
          >
            ✓
          </span>
          See how many gifts have been claimed
        </li>
        <li class="flex items-start gap-2">
          <span
            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-sage-deep"
            aria-hidden="true"
          >
            ✓
          </span>
          One payment, yours forever
        </li>
        <li class="flex items-start gap-2">
          <span
            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-sage-deep"
            aria-hidden="true"
          >
            ✓
          </span>
          Secure FPX or card payment
        </li>
      </ul>
    </BaseCard>

    <div class="mt-10 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="font-display text-3xl text-ink">Your events</h2>
        <p class="mt-1 text-sm text-ink/65">
          Each event holds one wishlist you can fill with gifts.
        </p>
      </div>
      <BaseButton to="/events/new" size="sm">Create event</BaseButton>
    </div>

    <p
      v-if="loadError"
      role="alert"
      class="mt-6 rounded-2xl border border-rose/40 bg-blush/40 px-4 py-3 text-sm text-rose-deep"
    >
      {{ loadError }}
    </p>

    <div class="mt-8">
      <LoadingState v-if="loading" label="Loading your events…" :rows="3" />

      <EmptyState
        v-else-if="events.length === 0"
        title="No events yet"
        message="Every lovely wishlist starts with an occasion. Create your first event and we'll help you gather the gifts."
      >
        <template #action>
          <BaseButton to="/events/new">Create your first event</BaseButton>
        </template>
      </EmptyState>

      <ul
        v-else
        class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Your events"
      >
        <li v-for="item in events" :key="item.id">
          <EventCard :event="item" @delete="askDelete(item)" />
        </li>
      </ul>
    </div>

    <ConfirmDialog
      v-model="deleteOpen"
      title="Delete this event?"
      :message="`“${eventToDelete?.name ?? 'This event'}” and its wishlist will be permanently deleted. This cannot be undone.`"
      confirm-label="Delete event"
      :loading="deleting"
      :error="deleteError"
      @confirm="confirmDelete"
    />

    <UnlockDialog v-model="unlockOpen" :price-sen="unlockPriceSen" />
  </section>
</template>
