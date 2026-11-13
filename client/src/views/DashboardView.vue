<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseCard from "@/components/ui/BaseCard.vue";
import BowDivider from "@/components/decor/BowDivider.vue";
import PlanCheckoutDialog from "@/components/billing/PlanCheckoutDialog.vue";
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
import {
  PLAN_CATALOG,
  PLAN_FEATURE_LABELS,
  PLAN_FEATURE_ORDER,
  formatPlanPrice,
  type BillingProduct,
  type PlanFeatureKey,
  type PlanTier,
} from "@/lib/plans";

const route = useRoute();
const router = useRouter();
const { user, logout, currentPlan } = useAuth();

const events = ref<EventSummary[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const loggingOut = ref(false);

const billing = ref<BillingSummary | null>(null);
const unlockOpen = ref(false);
const selectedProduct = ref<BillingProduct>("PRO");

const plan = computed<PlanTier>(() => billing.value?.plan ?? currentPlan.value);
const planDefinition = computed(() => PLAN_CATALOG[plan.value]);

const planUnlockedLabel = computed(() => {
  const value =
    billing.value?.planUnlockedAt ?? user.value?.planUnlockedAt ?? null;
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

const benefitRows = computed(() =>
  PLAN_FEATURE_ORDER.map((key) => ({
    key,
    label: PLAN_FEATURE_LABELS[key],
    included: planDefinition.value.features[key],
    comingSoon: planDefinition.value.comingSoon.includes(key as PlanFeatureKey),
  })),
);

const upgrades = computed(() =>
  plan.value === "FREE" ? [PLAN_CATALOG.PRO] : [],
);

const planDescription = computed(() => {
  if (plan.value === "FREE") {
    return `Your Free plan includes ${planDefinition.value.activeEventLimit} active event and ${planDefinition.value.itemLimit} gifts per wishlist. Unlock an event for ${formatPlanPrice(billing.value?.prices.EVENT_PASS ?? 990)} or go Pro for every celebration.`;
  }

  return "Up to 10 active events and unlimited gifts on every wishlist, with claimant names and priority support. Guest media notes are on the way.";
});

function openUpgrade() {
  selectedProduct.value = "PRO";
  unlockOpen.value = true;
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
            v-if="plan !== 'FREE'"
            class="rounded-full bg-rose px-2.5 py-1 text-xs font-medium uppercase tracking-[0.18em] text-white"
          >
            {{ planDefinition.shortLabel }}
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
                plan !== 'FREE'
                  ? 'bg-rose/10 text-rose-deep'
                  : 'bg-blush/70 text-ink/70'
              "
            >
              {{ planDefinition.shortLabel }}
            </span>
            <h2 class="font-display text-2xl text-ink">
              {{ planDefinition.label }}
            </h2>
          </div>

          <p class="mt-2 text-sm leading-relaxed text-ink/70">
            {{ planDescription }}
            <template v-if="planUnlockedLabel">
              Unlocked {{ planUnlockedLabel }}.
            </template>
          </p>
        </div>

        <div v-if="upgrades.length" class="flex shrink-0 flex-wrap gap-2">
          <BaseButton
            v-for="upgrade in upgrades"
            :key="upgrade.tier"
            size="sm"
            variant="primary"
            @click="openUpgrade"
          >
            {{ upgrade.shortLabel }} · {{ formatPlanPrice(upgrade.priceSen) }}
          </BaseButton>
        </div>
      </div>

      <p class="mt-5 text-xs uppercase tracking-[0.2em] text-ink/45">
        {{ plan === "FREE" ? "What's included" : "Your plan benefits" }}
      </p>
      <ul class="mt-3 grid gap-2 text-sm text-ink/75 sm:grid-cols-2">
        <li
          v-for="benefit in benefitRows"
          :key="benefit.key"
          class="flex items-start gap-2"
        >
          <span
            v-if="!benefit.comingSoon"
            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            :class="
              benefit.included
                ? 'bg-sage text-sage-deep'
                : 'bg-blush/70 text-rose'
            "
            aria-hidden="true"
          >
            {{ benefit.included ? "✓" : "×" }}
          </span>
          <span>
            {{ benefit.label }}
            <span
              v-if="benefit.comingSoon"
              class="ml-1 rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink/55"
            >
              Soon
            </span>
          </span>
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

    <PlanCheckoutDialog v-model="unlockOpen" :product="selectedProduct" />
  </section>
</template>
